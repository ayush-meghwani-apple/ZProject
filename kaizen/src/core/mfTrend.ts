//
// Reconstruct a month-on-month value trend for the tracked mutual funds, so the
// Pulse tab can show whether the portfolio is climbing or slipping — without
// storing history. For each past month we already know the cumulative units held
// (from the buy ledger) and can price them at that month's NAV (from the history
// we fetch anyway). Pure & unit-tested.

import type { MutualFundHolding } from '../types/models';
import { navOnOrBefore, type NavPoint } from './amfi';

export interface TrendPoint {
  ym: string; // "yyyy-mm"
  invested: number; // cumulative amount put in by month-end
  value: number; // cumulative units × NAV at month-end
}

function ymOf(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Monthly invested-vs-value series for a set of funds, oldest→newest, limited to
 * the last `months` entries. `navs` maps a scheme code to its NAV history
 * (newest-first). When a fund's history is missing (offline), its latest cached
 * NAV is used so the line still reflects contributions instead of breaking.
 */
export function mfMonthlyTrend(
  funds: MutualFundHolding[],
  navs: Record<number, NavPoint[]>,
  months = 9,
  asOf: Date = new Date(),
): TrendPoint[] {
  if (!funds.length) return [];

  let earliest: Date | null = null;
  for (const f of funds) {
    for (const t of f.transactions) {
      const d = new Date(t.date);
      if (!Number.isNaN(d.getTime()) && (!earliest || d < earliest)) earliest = d;
    }
  }
  if (!earliest) return [];

  const out: TrendPoint[] = [];
  const cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  const endMonth = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  let guard = 0;
  while (cursor.getTime() <= endMonth.getTime() && guard < 600) {
    guard++;
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const isCurrent = y === asOf.getFullYear() && m === asOf.getMonth();
    const valDate = isCurrent ? asOf : new Date(y, m + 1, 0); // last day of month

    let invested = 0;
    let value = 0;
    for (const f of funds) {
      let units = 0;
      let inv = 0;
      for (const t of f.transactions) {
        if (new Date(t.date).getTime() <= valDate.getTime()) {
          units += Number(t.units) || 0;
          inv += Number(t.amount) || 0;
        }
      }
      if (units <= 0 && inv <= 0) continue;
      invested += inv;
      const pts = navs[f.schemeCode];
      const p = pts ? navOnOrBefore(pts, valDate) : null;
      const nav = p && p.nav > 0 ? p.nav : Number(f.latestNav) || 0;
      value += units * nav;
    }
    out.push({ ym: ymOf(y, m), invested: Math.round(invested), value: Math.round(value) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out.slice(-months);
}

export type TrendRange = '1M' | '6M' | '1Y' | 'MAX';

export interface ValuePoint {
  t: number; // timestamp
  value: number; // portfolio value on that day
  invested: number; // cumulative amount invested by that day
}

/**
 * A dated value-vs-invested series over a chosen window, sampled to at most
 * `maxPoints` evenly-spaced days. `MAX` runs from the first-ever transaction
 * (the user's first investment) to today; the fixed ranges look back that many
 * months. Portfolio value at each day = Σ cumulative units × NAV-on-or-before,
 * falling back to the fund's cached NAV when history is missing.
 */
export function mfValueSeries(
  funds: MutualFundHolding[],
  navs: Record<number, NavPoint[]>,
  range: TrendRange = '1Y',
  asOf: Date = new Date(),
  maxPoints = 48,
): ValuePoint[] {
  if (!funds.length) return [];

  let first = Infinity;
  for (const f of funds) {
    for (const t of f.transactions) {
      const ms = new Date(t.date).getTime();
      if (Number.isFinite(ms) && ms < first) first = ms;
    }
  }
  if (!Number.isFinite(first)) return [];

  const end = asOf.getTime();
  const monthsBack = range === '1M' ? 1 : range === '6M' ? 6 : range === '1Y' ? 12 : null;
  let start = first;
  if (monthsBack != null) {
    const d = new Date(asOf);
    d.setMonth(d.getMonth() - monthsBack);
    start = Math.max(first, d.getTime());
  }
  if (start >= end) start = first;

  const span = Math.max(1, end - start);
  const n = Math.max(2, maxPoints);
  const out: ValuePoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = start + (span * i) / (n - 1);
    const date = new Date(t);
    let value = 0;
    let invested = 0;
    for (const f of funds) {
      let units = 0;
      let inv = 0;
      for (const tx of f.transactions) {
        if (new Date(tx.date).getTime() <= t) {
          units += Number(tx.units) || 0;
          inv += Number(tx.amount) || 0;
        }
      }
      if (units <= 0 && inv <= 0) continue;
      invested += inv;
      const pts = navs[f.schemeCode];
      const p = pts ? navOnOrBefore(pts, date) : null;
      const nav = p && p.nav > 0 ? p.nav : Number(f.latestNav) || 0;
      value += units * nav;
    }
    out.push({ t, value: Math.round(value), invested: Math.round(invested) });
  }
  return out;
}
