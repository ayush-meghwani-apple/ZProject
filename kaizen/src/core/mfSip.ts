//
// SIP auto-fill — turn a fund's SIP rule (amount + day-of-month + start date)
// into the individual buy installments it would have produced, pricing each at
// the historical NAV on that day (the last published NAV on-or-before the date,
// since markets are shut on weekends/holidays). Pure: it returns the NEW
// transactions to append; the caller fetches the NAV history and persists.

import type { MFTransaction, MutualFundHolding } from '../types/models';
import { navOnOrBefore, type NavPoint } from './amfi';
import { nextWorkingDay } from './marketCalendar';
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
 * - Each is dated the SIP `dayOfMonth` (clamped to the month's length), then
 *   rolled forward to the next trading day if that lands on a weekend/holiday
 *   (that's when the AMC actually allots the units).
 * - A month already containing a SIP transaction is skipped, so existing/edited
 *   installments are never duplicated (lumpsums don't block a month).
 * - Pricing is best-effort and never breaks: it uses the NAV on-or-before the
 *   allotment day; failing that (date predates history) it falls back to the
 *   earliest known NAV, then the fund's cached latest NAV, then the NAV used in
 *   the fund's most recent transaction — so an installment is always produced
 *   when the SIP is due.
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

  // Fallback NAV chain (used when the allotment day predates the fund's history
  // or its NAV isn't published yet): earliest known point, else cached latest,
  // else the NAV of the most recent transaction. Keeps the SIP from stalling.
  const earliestPoint = points.length ? points[points.length - 1] : null;
  const lastTxn = [...fund.transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )[0];
  const fallbackNav = (): number =>
    (earliestPoint?.nav || fund.latestNav || lastTxn?.nav || 0) as number;

  const out: MFTransaction[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 1200) {
    guard++;
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const day = Math.min(sip.dayOfMonth, daysInMonth(y, m));
    const scheduled = new Date(y, m, day);
    // The unit allotment happens on the next trading day if the SIP date is a
    // weekend/holiday; de-dup by the SCHEDULED month so a roll into the next
    // month can't create two installments for one cycle.
    const allot = nextWorkingDay(scheduled);

    const inWindow = scheduled.getTime() >= start.getTime() && allot.getTime() <= end.getTime();
    if (inWindow && !covered.has(monthKey(scheduled))) {
      const point = navOnOrBefore(points, allot);
      const nav = point && point.nav > 0 ? point.nav : fallbackNav();
      if (nav > 0) {
        out.push({
          id: newId(),
          date: startOfDay(allot).toISOString(),
          amount: sip.amount,
          units: sip.amount / nav,
          nav,
          kind: 'sip',
          auto: true,
        });
        covered.add(monthKey(scheduled));
      }
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}
