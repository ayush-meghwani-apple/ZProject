/**
 * Salary-cycle start-date logic.
 *
 * The salary lands on the 28th of the month; if the 28th falls on a weekend the
 * effective day is the **preceding Friday** (Sat → 27th, Sun → 26th). These are
 * pure date helpers with no side effects, so the rule is easy to reason about
 * and reuse. All dates are handled at local midnight.
 */

/** The nominal salary day of the month (the 28th). */
export const SALARY_DAY = 28;

/** Move a date off a weekend onto the preceding Friday (weekdays unchanged). */
export function toPrecedingWorkingDay(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = out.getDay(); // 0 = Sun … 6 = Sat
  if (day === 6) out.setDate(out.getDate() - 1); // Saturday → Friday
  else if (day === 0) out.setDate(out.getDate() - 2); // Sunday → Friday
  return out;
}

/** The salary/cycle start date for a given month: the 28th, pulled back to the
 *  preceding Friday if that's a weekend. */
export function salaryDateForMonth(year: number, monthIndex: number): Date {
  return toPrecedingWorkingDay(new Date(year, monthIndex, SALARY_DAY));
}

/**
 * The start of the salary period that CONTAINS `ref`: this month's salary date
 * if `ref` is on/after it, otherwise the previous month's. e.g. on the 12th the
 * current period began on last month's 28th; on the 29th it began this month's.
 */
export function currentCycleStart(ref: Date = new Date()): Date {
  const thisMonth = salaryDateForMonth(ref.getFullYear(), ref.getMonth());
  const refMidnight = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (refMidnight.getTime() >= thisMonth.getTime()) return thisMonth;
  // JS Date normalises month -1 into the previous year automatically.
  return salaryDateForMonth(ref.getFullYear(), ref.getMonth() - 1);
}

/** The next upcoming salary date strictly after `ref`. */
export function nextCycleStart(ref: Date = new Date()): Date {
  const thisMonth = salaryDateForMonth(ref.getFullYear(), ref.getMonth());
  const refMidnight = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  if (refMidnight.getTime() < thisMonth.getTime()) return thisMonth;
  return salaryDateForMonth(ref.getFullYear(), ref.getMonth() + 1);
}
