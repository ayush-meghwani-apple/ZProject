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
