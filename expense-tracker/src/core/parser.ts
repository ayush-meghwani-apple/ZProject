import type { Alias, Category, Subcategory } from '../types/models';

export type ParsedCommand =
  | { kind: 'salary'; amount: number; note?: string }
  | {
      kind: 'expense';
      amount: number;
      categoryId?: string;
      subcategoryId?: string;
      matchedAlias?: string;
      note?: string;
      rawText: string;
    }
  | { kind: 'startCycle' }
  | { kind: 'help' }
  | { kind: 'note'; text: string }
  | { kind: 'unknown'; rawText: string; reason: string };

const NUMBER_RE = /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)/i;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Safely evaluates a basic arithmetic expression: + - * / and parentheses,
 * including unary minus. Returns null on malformed input. Uses a small
 * shunting-yard implementation (no eval), so it is safe from code injection.
 */
export function evalArithmetic(input: string): number | null {
  const tokens = input.match(/\d+(?:\.\d+)?|[+\-*/()]/g);
  if (!tokens) return null;

  const output: (number | string)[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { u: 3, '*': 2, '/': 2, '+': 1, '-': 1 };
  let prev: 'num' | 'op' | 'open' | null = null;

  for (const t of tokens) {
    if (/^\d/.test(t)) {
      output.push(parseFloat(t));
      prev = 'num';
    } else if (t === '(') {
      ops.push(t);
      prev = 'open';
    } else if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop()!);
      if (!ops.length) return null;
      ops.pop();
      prev = 'num';
    } else {
      let op = t;
      if (t === '-' && (prev === null || prev === 'op' || prev === 'open')) op = 'u';
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top === '(') break;
        const higher = prec[top] > prec[op] || (prec[top] === prec[op] && op !== 'u');
        if (!higher) break;
        output.push(ops.pop()!);
      }
      ops.push(op);
      prev = 'op';
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === '(') return null;
    output.push(op);
  }

  const stack: number[] = [];
  for (const tk of output) {
    if (typeof tk === 'number') {
      stack.push(tk);
    } else if (tk === 'u') {
      const a = stack.pop();
      if (a === undefined) return null;
      stack.push(-a);
    } else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;
      if (tk === '+') stack.push(a + b);
      else if (tk === '-') stack.push(a - b);
      else if (tk === '*') stack.push(a * b);
      else {
        if (b === 0) return null;
        stack.push(a / b);
      }
    }
  }
  return stack.length === 1 && isFinite(stack[0]) ? stack[0] : null;
}

/**
 * Turns a line of chat into a structured command. Pure function: all reference
 * data (aliases) is passed in, so it has no dependency on storage or React.
 *
 * Examples:
 *   "tea 20"            -> expense ₹20, Food / Tea-Coffee
 *   "20 chai"           -> expense ₹20, Food / Tea-Coffee
 *   "petrol 500 card"   -> expense ₹500, Transport / Fuel, note "card"
 *   "salary 50000"      -> salary ₹50000
 *   "help"              -> help
 */
export function parseInput(
  text: string,
  aliases: Alias[],
  categories: Category[] = [],
  subcategories: Subcategory[] = [],
): ParsedCommand {
  const raw = text.trim();
  const lower = raw.toLowerCase();

  if (!raw) return { kind: 'unknown', rawText: raw, reason: 'Empty input.' };
  if (lower === 'help' || lower === '?') return { kind: 'help' };

  // Start a fresh tracking cycle from this instant (no income needed).
  if (
    /\b(start|new|reset)\s+cycle\b/i.test(lower) ||
    /\bcycle\s+(start|reset|new)\b/i.test(lower)
  ) {
    return { kind: 'startCycle' };
  }

  // Explicit note after a comma: "1000 mobile, paid for ayush".
  let explicitNote: string | undefined;
  let head = raw;
  const commaIdx = raw.indexOf(',');
  if (commaIdx !== -1) {
    explicitNote = raw.slice(commaIdx + 1).trim() || undefined;
    head = raw.slice(0, commaIdx);
  }

  // ---- Amount (supports arithmetic, e.g. "=20+20+2*6") ----
  const normalized = head
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/₹|\brs\.?\b|\binr\b/gi, ' ');
  const calcMode = normalized.includes('=');
  const mathSource = normalized.replace(/=/g, ' ');

  let amount = NaN;
  let amountText: string | undefined;
  const exprMatch = mathSource.match(/\d[\d.\s+\-*\/()]*[\d)]|\d/);
  if (exprMatch) {
    const candidate = exprMatch[0];
    const hasOperator = /[+\-*\/()]/.test(candidate);
    if (hasOperator || calcMode) {
      const value = evalArithmetic(candidate);
      if (value !== null) {
        amount = round2(value);
        amountText = candidate;
      }
    }
    if (isNaN(amount)) {
      const single = candidate.match(/\d+(?:\.\d{1,2})?/);
      if (single) {
        amount = parseFloat(single[0]);
        amountText = single[0];
      }
    }
  }

  // Salary command: "salary 50000" / "got salary 50000"
  if (/\bsalary\b/i.test(lower)) {
    if (isNaN(amount)) {
      return { kind: 'unknown', rawText: raw, reason: 'Salary needs an amount, e.g. "salary 50000".' };
    }
    return { kind: 'salary', amount };
  }

  if (isNaN(amount)) {
    if (calcMode) {
      return { kind: 'unknown', rawText: raw, reason: 'Could not calculate that expression.' };
    }
    // No amount and not a command: keep it as a free-form note / reminder that
    // stays in the chat instead of being rejected.
    return { kind: 'note', text: raw };
  }
  if (amount <= 0) {
    return { kind: 'unknown', rawText: raw, reason: 'Amount must be greater than zero.' };
  }

  // ---- Category / subcategory from the remaining words ----
  let body = head.toLowerCase();
  body = amountText ? body.replace(amountText.toLowerCase(), ' ') : body.replace(NUMBER_RE, ' ');

  const words = body
    .replace(/₹|\brs\.?\b|\binr\b/gi, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .filter((w) => !/^\d+(?:\.\d+)?$/.test(w));

  const used = new Array<boolean>(words.length).fill(false);
  let categoryId: string | undefined;
  let subcategoryId: string | undefined;

  // Split a name into the same cleaned tokens we produced for the input, so
  // multi-word and punctuated names (e.g. "Mobile/Internet") compare reliably.
  const nameTokens = (name: string): string[] =>
    name
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean);

  // Find a contiguous, unused run of words equal to `tokens`. Returns its start.
  const findRun = (tokens: string[]): number => {
    if (tokens.length === 0) return -1;
    for (let i = 0; i + tokens.length <= words.length; i++) {
      let ok = true;
      for (let j = 0; j < tokens.length; j++) {
        if (used[i + j] || words[i + j] !== tokens[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  };

  const markRun = (start: number, len: number) => {
    for (let j = 0; j < len; j++) used[start + j] = true;
  };

  // 1) Category by full name first (longest names first for specificity).
  //    Matching an explicitly-typed category before anything else means a
  //    single-word alias (e.g. "mobile" -> Ayush) can never override a category
  //    you named — "Home Mobile Recharge" stays under Home.
  let categoryFromName = false;
  {
    const cats = [...categories].sort(
      (a, b) => nameTokens(b.name).length - nameTokens(a.name).length,
    );
    for (const c of cats) {
      const at = findRun(nameTokens(c.name));
      if (at !== -1) {
        categoryId = c.id;
        markRun(at, nameTokens(c.name).length);
        categoryFromName = true;
        break;
      }
    }
  }

  // 2) Category known: match a subcategory *within* it by name (e.g.
  //    "home mobile recharge" -> Home / Mobile Recharge; disambiguates shared
  //    names like a "Mobile Recharge" that also exists under another category).
  if (categoryId !== undefined && subcategoryId === undefined) {
    const subs = subcategories
      .filter((s) => s.categoryId === categoryId)
      .sort((a, b) => nameTokens(b.name).length - nameTokens(a.name).length);
    for (const s of subs) {
      const at = findRun(nameTokens(s.name));
      if (at !== -1) {
        subcategoryId = s.id;
        markRun(at, nameTokens(s.name).length);
        break;
      }
    }
  }

  // 3) Aliases (single trigger words like "chai"). If a category was named
  //    explicitly, only honour an alias that belongs to that same category (to
  //    fill in the subcategory) — never one pointing at a different category.
  for (let i = 0; i < words.length; i++) {
    if (used[i]) continue;
    const hit = aliases.find((a) => a.text === words[i]);
    if (!hit) continue;
    if (categoryFromName) {
      if (hit.categoryId === categoryId && subcategoryId === undefined && hit.subcategoryId) {
        subcategoryId = hit.subcategoryId;
        used[i] = true;
        break;
      }
      continue; // ignore aliases that point at a different category
    }
    categoryId = hit.categoryId;
    subcategoryId = hit.subcategoryId;
    used[i] = true;
    break;
  }

  // 4) Nothing matched a category yet: fall back to a global subcategory match
  //    by full name (longest first), which also sets the parent category.
  if (categoryId === undefined) {
    const subs = [...subcategories].sort(
      (a, b) => nameTokens(b.name).length - nameTokens(a.name).length,
    );
    for (const s of subs) {
      const at = findRun(nameTokens(s.name));
      if (at !== -1) {
        categoryId = s.categoryId;
        subcategoryId = s.id;
        markRun(at, nameTokens(s.name).length);
        break;
      }
    }
  }

  // Leftover words plus any explicit (post-comma) note.
  const leftover = words.filter((_, i) => !used[i]).join(' ').trim();
  const note = [leftover, explicitNote].filter(Boolean).join(' ').trim() || undefined;

  return {
    kind: 'expense',
    amount,
    categoryId,
    subcategoryId,
    note,
    rawText: raw,
  };
}
