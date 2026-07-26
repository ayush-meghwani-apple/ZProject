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

interface SipPrice {
  nav: number;
  units: number;
  processing: boolean;
}

/**
 * Decide the NAV / units for an installment allotted on `allot`, given the NAV
 * history. An installment is *settled* only once its allotment day has arrived
 * AND that exact day's NAV is published (AMFI posts it by ~mid-morning the next
 * working day). Until then it's `processing` (nav/units unknown). Installments
 * whose allotment is long past but never got an exact NAV (a data gap, or a buy
 * predating the fund's history) fall back to the best available NAV so they
 * don't hang in "processing" forever.
 */
function priceAllotment(
  points: NavPoint[],
  allot: Date,
  amount: number,
  todayMid: number,
  fallbackNav: () => number,
): SipPrice {
  const point = navOnOrBefore(points, allot);
  const allotMid = allot.getTime();
  const exact = !!point && point.nav > 0 && point.date.getTime() === allotMid;
  if (allotMid <= todayMid && exact && point) {
    return { nav: point.nav, units: amount / point.nav, processing: false };
  }
  const STALE_MS = 7 * 86400000; // ~a week past due with no exact NAV → stop waiting
  if (allotMid <= todayMid - STALE_MS) {
    const nav = point && point.nav > 0 ? point.nav : fallbackNav();
    if (nav > 0) return { nav, units: amount / nav, processing: false };
  }
  return { nav: 0, units: 0, processing: true };
}

/**
 * Generate the missing SIP installments for a fund, up to `today`.
 * - One installment per month from the SIP's start month to the current month.
 * - Each is RECORDED on the SIP `dayOfMonth` (clamped to the month's length) as
 *   soon as that date arrives — this is the date shown in the Ledger, even when
 *   that day is a weekend/holiday.
 * - The unit allotment actually happens on the NEXT working day (Mon–Fri, non-
 *   holiday), priced at that day's NAV. Until the allotment NAV is published the
 *   installment is marked `processing` (nav/units 0); a later sync fills it in
 *   via {@link settlePendingSips}.
 * - A month already containing a SIP transaction is skipped, so existing/edited
 *   installments (and pending ones) are never duplicated.
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
  const todayMid = end.getTime();
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 1200) {
    guard++;
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const day = Math.min(sip.dayOfMonth, daysInMonth(y, m));
    const scheduled = new Date(y, m, day);
    const allot = nextWorkingDay(scheduled);

    // Record the installment once its SCHEDULED date has arrived (de-dup by the
    // scheduled month so a weekend roll can't create two for one cycle).
    const inWindow = scheduled.getTime() >= start.getTime() && scheduled.getTime() <= end.getTime();
    if (inWindow && !covered.has(monthKey(scheduled))) {
      const priced = priceAllotment(points, allot, sip.amount, todayMid, fallbackNav);
      if (priced.processing || priced.nav > 0) {
        out.push({
          id: newId(),
          date: startOfDay(scheduled).toISOString(),
          amount: sip.amount,
          units: priced.units,
          nav: priced.nav,
          kind: 'sip',
          auto: true,
          ...(priced.processing ? { processing: true } : {}),
        });
        covered.add(monthKey(scheduled));
      }
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

/**
 * Fill in any PROCESSING SIP installments whose allotment-day NAV has since been
 * published (or which are now stale enough to price at the best available NAV).
 * Mutates `fund.transactions` in place; returns how many were settled. Call this
 * alongside a NAV refresh so pending installments settle on their own.
 */
export function settlePendingSips(
  fund: MutualFundHolding,
  points: NavPoint[],
  today: Date = new Date(),
): number {
  if (!fund.transactions?.length) return 0;
  const todayMid = startOfDay(today).getTime();
  const earliestPoint = points.length ? points[points.length - 1] : null;
  const fallbackNav = (): number => (earliestPoint?.nav || fund.latestNav || 0) as number;
  let settled = 0;
  for (const t of fund.transactions) {
    if (t.kind !== 'sip' || !t.processing) continue;
    const scheduled = startOfDay(new Date(t.date));
    const allot = nextWorkingDay(scheduled);
    const priced = priceAllotment(points, allot, t.amount, todayMid, fallbackNav);
    if (!priced.processing && priced.nav > 0) {
      t.nav = priced.nav;
      t.units = priced.units;
      delete t.processing;
      settled++;
    }
  }
  return settled;
}
