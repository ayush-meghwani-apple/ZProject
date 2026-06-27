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
  | { kind: 'unknown'; rawText: string; reason: string };

const NUMBER_RE = /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)/i;

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

  const amountMatch = raw.match(NUMBER_RE);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : NaN;

  // Salary command: "salary 50000" / "got salary 50000"
  if (/\bsalary\b/i.test(lower)) {
    if (isNaN(amount)) {
      return { kind: 'unknown', rawText: raw, reason: 'Salary needs an amount, e.g. "salary 50000".' };
    }
    return { kind: 'salary', amount };
  }

  if (isNaN(amount)) {
    return { kind: 'unknown', rawText: raw, reason: 'Could not find an amount. Try "tea 20".' };
  }

  // An explicit note can be given after a comma: "1000 mobile, paid for ayush".
  let explicitNote: string | undefined;
  let body = lower;
  const commaIdx = lower.indexOf(',');
  if (commaIdx !== -1) {
    explicitNote = raw.slice(commaIdx + 1).trim() || undefined;
    body = lower.slice(0, commaIdx);
  }

  // Tokenize words (ignore the number, currency symbols, and punctuation).
  const words = body
    .replace(NUMBER_RE, ' ')
    .replace(/[₹]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  let categoryId: string | undefined;
  let subcategoryId: string | undefined;
  let matchedWord: string | undefined;
  for (const word of words) {
    const hit = aliases.find((a) => a.text === word);
    if (hit) {
      categoryId = hit.categoryId;
      subcategoryId = hit.subcategoryId;
      matchedWord = word;
      break;
    }
  }

  // Fallback: match a word directly against a subcategory or category name.
  // This covers categories added without an explicit alias (and older data).
  if (!matchedWord) {
    for (const word of words) {
      const sub = subcategories.find((s) => s.name.toLowerCase() === word);
      if (sub) {
        categoryId = sub.categoryId;
        subcategoryId = sub.id;
        matchedWord = word;
        break;
      }
      const cat = categories.find((c) => c.name.toLowerCase() === word);
      if (cat) {
        categoryId = cat.id;
        matchedWord = word;
        break;
      }
    }
  }

  // Leftover words plus any explicit (post-comma) note.
  const leftover = words.filter((w) => w !== matchedWord).join(' ').trim();
  const note = [leftover, explicitNote].filter(Boolean).join(' ').trim() || undefined;

  return {
    kind: 'expense',
    amount,
    categoryId,
    subcategoryId,
    matchedAlias: matchedWord,
    note,
    rawText: raw,
  };
}
