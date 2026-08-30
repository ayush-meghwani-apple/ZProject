// Salary detection from bank credit emails — pattern based, no employer name
// hardcoded. A salary credit is recognised when a CREDIT lands around the
// monthly payday (the 28th, pulled back to the last working day before a
// weekend/holiday) with a large amount, or when the email narration literally
// mentions salary/payroll. Pure and testable.

import { salaryDateForMonth } from './cycleDate';
import { isMarketClosed } from './marketCalendar';
import type { ParsedTxnEmail } from './emailParse';

// Narration words banks/employers use for a salary credit. Deliberately generic.
const SALARY_KEYWORDS = /\b(salary|payroll|wages|sal\s*cr|salary\s*credit|neft\s*sal)\b/i;

// Fixed internal threshold (not user-exposed): a near-payday credit of at least
// this much is treated as salary even without a “salary” narration.
export const SALARY_MIN_AMOUNT = 180000;

export interface SalaryDetectOptions {
  /** Minimum credit amount for the amount+payday path (0 disables that path). */
  minAmount: number;
  /** Days on either side of the expected payday still counted as "on payday". */
  windowDays?: number;
}

export interface SalaryVerdict {
  isSalary: boolean;
  reason: string;
}

/**
 * The expected payday for a month: the 28th, pulled back to the preceding Friday
 * for a weekend, then further back over any known bank/market holiday.
 */
export function expectedPayday(year: number, monthIndex: number): Date {
  let d = salaryDateForMonth(year, monthIndex); // 28th → preceding Friday if weekend
  let guard = 0;
  while (isMarketClosed(d) && guard++ < 10) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  }
  return d;
}

/** True if an ISO date is within `windowDays` of this or last month's payday. */
export function isNearPayday(dateISO: string, windowDays = 3): boolean {
  const d = new Date(dateISO);
  const day = 86_400_000;
  const here = expectedPayday(d.getFullYear(), d.getMonth());
  if (Math.abs(d.getTime() - here.getTime()) / day <= windowDays) return true;
  // Credits early in the month belong to the previous month's payday.
  const prev = expectedPayday(d.getFullYear(), d.getMonth() - 1);
  return Math.abs(d.getTime() - prev.getTime()) / day <= windowDays;
}

/**
 * Decide whether a parsed credit email is a salary credit. `text` is the email
 * subject+body used only for the narration-keyword check.
 */
export function detectSalary(
  parsed: ParsedTxnEmail,
  text: string,
  opts: SalaryDetectOptions,
): SalaryVerdict {
  if (parsed.direction !== 'credit') return { isSalary: false, reason: 'not a credit' };
  const amount = parsed.amount ?? 0;
  if (amount <= 0) return { isSalary: false, reason: 'no amount' };

  if (SALARY_KEYWORDS.test(text)) return { isSalary: true, reason: 'salary narration' };

  const bigEnough = opts.minAmount > 0 && amount >= opts.minAmount;
  const near = parsed.date ? isNearPayday(parsed.date, opts.windowDays) : false;
  if (bigEnough && near) return { isSalary: true, reason: 'large credit near payday' };

  return { isSalary: false, reason: 'no salary signal' };
}
