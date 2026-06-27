import type { Alias } from '../types/models';

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
export function parseInput(text: string, aliases: Alias[]): ParsedCommand {
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

  // Tokenize words (ignore the number and currency symbols) and match aliases.
  const words = lower
    .replace(NUMBER_RE, ' ')
    .replace(/[₹]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let matched: Alias | undefined;
  let matchedWord: string | undefined;
  for (const word of words) {
    const hit = aliases.find((a) => a.text === word);
    if (hit) {
      matched = hit;
      matchedWord = word;
      break;
    }
  }

  // Leftover words (excluding the matched alias) become the note.
  const note = words.filter((w) => w !== matchedWord).join(' ').trim() || undefined;

  return {
    kind: 'expense',
    amount,
    categoryId: matched?.categoryId,
    subcategoryId: matched?.subcategoryId,
    matchedAlias: matchedWord,
    note,
    rawText: raw,
  };
}
