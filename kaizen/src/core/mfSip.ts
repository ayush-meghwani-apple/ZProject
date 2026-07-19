//
// SIP auto-fill — turn a fund's SIP rule (amount + day-of-month + start date)
// into the individual buy installments it would have produced, pricing each at
// the historical NAV on that day (the last published NAV on-or-before the date,
// since markets are shut on weekends/holidays). Pure: it returns the NEW
// transactions to append; the caller fetches the NAV history and persists.

import type { MFTransaction, MutualFundHolding } from '../types/models';
import { navOnOrBefore, type NavPoint } from './amfi';
import { newId } from './util';

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/**
 * Generate the missing SIP installments for a fund, up to `today`.
 * - One installment per month from the SIP's start month to the current month.
 * - Each is dated the SIP `dayOfMonth` (clamped to the month's length).
 * - A month already containing a SIP transaction is skipped, so existing/edited
 *   installments are never duplicated (lumpsums don't block a month).
 * - A month whose NAV can't be priced yet (predates the fund's history, or NAV
 *   not published) is skipped — the user can add it manually later.
 */
export function generateSipInstallments(
  fund: MutualFundHolding,
  points: NavPoint[],
  today: Date = new Date(),
): MFTransaction[] {
  const sip = fund.sip;
  if (!sip || !sip.active || !(sip.amount > 0)) return [];

  const start = startOfDay(new Date(sip.startDate));
  const end = startOfDay(today);
  if (start.getTime() > end.getTime()) return [];

  // Months that already have a SIP installment — never duplicate them.
  const covered = new Set<string>();
  for (const t of fund.transactions) {
    if (t.kind === 'sip') covered.add(monthKey(new Date(t.date)));
  }

  const out: MFTransaction[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 1200) {
    guard++;
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const day = Math.min(sip.dayOfMonth, daysInMonth(y, m));
    const due = new Date(y, m, day);

    const inWindow = due.getTime() >= start.getTime() && due.getTime() <= end.getTime();
    if (inWindow && !covered.has(monthKey(due))) {
      const point = navOnOrBefore(points, due);
      if (point && point.nav > 0) {
        out.push({
          id: newId(),
          date: startOfDay(due).toISOString(),
          amount: sip.amount,
          units: sip.amount / point.nav,
          nav: point.nav,
          kind: 'sip',
          auto: true,
        });
        covered.add(monthKey(due));
      }
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}
