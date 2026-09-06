//
// Monthly plan snapshots — capture the plan's headline figures once per calendar
// month so the app can draw a month-on-month trend (net worth, MF value) without
// storing or recomputing full history. Pure except for reading `new Date()`.

import type { FinancialPlan, PlanSnapshot } from '../types/models';
import { computeNetWorth, trackedFundsByClass } from './plannerMath';

/** "yyyy-mm" for a date (defaults to now). */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "yyyy-mm-dd" for a date (defaults to now). */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type ChartRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'MAX';

/** Filter a day-keyed series to the trailing window for a chart range. */
export function sliceDays<T extends { d: string }>(days: T[], range: ChartRange, asOf: Date = new Date()): T[] {
  if (range === 'MAX' || !days.length) return days;
  const back = range === '1W' ? 7 : range === '1M' ? 31 : range === '3M' ? 93 : range === '6M' ? 186 : 365;
  const cut = new Date(asOf);
  cut.setDate(cut.getDate() - back);
  const cutKey = dayKey(cut);
  return days.filter((s) => s.d >= cutKey);
}

/** "yyyy-mm-dd" → "12 Jul" for an x-axis label. */
export function dayLabel(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, day || 1);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export interface AssetHistoryPoint {
  d: string;
  totalAssets: number;
}

function rangeStart(range: ChartRange, asOf: Date): Date | null {
  if (range === 'MAX') return null;
  const back = range === '1W' ? 7 : range === '1M' ? 31 : range === '3M' ? 93 : range === '6M' ? 186 : 365;
  const start = new Date(asOf);
  start.setDate(start.getDate() - back);
  return start;
}

/**
 * Reconstruct total-assets history from dated Ledger and mutual-fund entries.
 * Holdings without a transaction date remain a stable base; the final point is
 * always the same live total shown in the Net Worth header.
 */
export function assetValueHistory(
  plan: FinancialPlan,
  range: ChartRange,
  asOf: Date = new Date(),
): AssetHistoryPoint[] {
  const tracked = trackedFundsByClass(plan.mutualFunds);
  const live = computeNetWorth(
    plan.assets,
    plan.liabilities,
    plan.disabledClasses ?? [],
    plan.customClasses ?? [],
    tracked,
  );
  const disabled = new Set(plan.disabledClasses ?? []);
  const enabledFunds = (plan.mutualFunds ?? []).filter((fund) => !disabled.has(fund.category === 'debt' ? 'debt' : 'equity_mf'));
  const currentMf = enabledFunds.reduce((sum, fund) => {
    const units = (fund.transactions ?? []).reduce((total, transaction) => total + (Number(transaction.units) || 0), 0);
    return sum + units * (Number(fund.latestNav) || 0);
  }, 0);
  const ledgerEntries = (plan.ledger ?? []).filter((entry) => !disabled.has(entry.assetClassKey));
  const currentLedger = ledgerEntries.reduce(
    (sum, entry) => sum + (entry.kind === 'sell' ? -Math.abs(Number(entry.amount) || 0) : Math.abs(Number(entry.amount) || 0)),
    0,
  );
  const stableBase = live.totalAssets - currentMf - currentLedger;
  const start = rangeStart(range, asOf);
  const startKey = start ? dayKey(start) : '';
  const todayKey = dayKey(asOf);
  const dates = new Set<string>([todayKey]);

  if (start) dates.add(startKey);
  for (const snapshot of plan.daySnapshots ?? []) {
    if ((!startKey || snapshot.d >= startKey) && snapshot.d <= todayKey) dates.add(snapshot.d);
  }
  const addEventDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return;
    const key = dayKey(date);
    if ((!startKey || key >= startKey) && key <= todayKey) {
      dates.add(key);
      const previous = new Date(date);
      previous.setDate(previous.getDate() - 1);
      const previousKey = dayKey(previous);
      if (!startKey || previousKey >= startKey) dates.add(previousKey);
    }
  };
  for (const fund of enabledFunds) for (const transaction of fund.transactions ?? []) addEventDate(transaction.date);
  for (const entry of ledgerEntries) addEventDate(entry.date);

  const orderedDates = [...dates].sort();
  return orderedDates.map((d) => {
    const end = new Date(`${d}T23:59:59.999`).getTime();
    let mfValue = 0;
    for (const fund of enabledFunds) {
      let units = 0;
      let nav = 0;
      let navTimestamp = -Infinity;
      for (const transaction of fund.transactions ?? []) {
        const timestamp = new Date(transaction.date).getTime();
        if (!transaction.processing && Number.isFinite(timestamp) && timestamp <= end) {
          units += Number(transaction.units) || 0;
          if ((Number(transaction.nav) || 0) > 0 && timestamp >= navTimestamp) {
            nav = Number(transaction.nav);
            navTimestamp = timestamp;
          }
        }
      }
      if (d === todayKey && (Number(fund.latestNav) || 0) > 0) nav = Number(fund.latestNav);
      mfValue += units * nav;
    }
    const ledgerValue = ledgerEntries.reduce((sum, entry) => {
      if (new Date(entry.date).getTime() > end) return sum;
      const amount = Math.abs(Number(entry.amount) || 0);
      return sum + (entry.kind === 'sell' ? -amount : amount);
    }, 0);
    return { d, totalAssets: Math.round(stableBase + ledgerValue + mfValue) };
  });
}

/** Tracked mutual funds' total invested and current value (units × latest NAV). */
export function mfTotals(plan: FinancialPlan): { invested: number; current: number } {
  let invested = 0;
  let current = 0;
  for (const f of plan.mutualFunds ?? []) {
    let units = 0;
    for (const t of f.transactions ?? []) {
      if (t.processing) continue; // pending SIP — not executed yet
      invested += Number(t.amount) || 0;
      units += Number(t.units) || 0;
    }
    current += units * (Number(f.latestNav) || 0);
  }
  return { invested, current };
}

/**
 * Ensure a snapshot exists for the current month, mutating `plan.snapshots` in
 * place. Overwrites the current month's snapshot with fresh figures (so it
 * reflects the latest state each open) and leaves past months untouched. Returns
 * true if the snapshot list changed (caller should persist).
 */
export function captureMonthlySnapshot(plan: FinancialPlan, when: Date = new Date()): boolean {
  const ym = monthKey(when);
  const tracked = trackedFundsByClass(plan.mutualFunds);
  const nw = computeNetWorth(
    plan.assets,
    plan.liabilities,
    plan.disabledClasses ?? [],
    plan.customClasses ?? [],
    tracked,
  );
  const mf = mfTotals(plan);
  const snap: PlanSnapshot = {
    ym,
    at: when.toISOString(),
    netWorth: Math.round(nw.netWorth),
    totalAssets: Math.round(nw.totalAssets),
    mfInvested: Math.round(mf.invested),
    mfCurrent: Math.round(mf.current),
  };

  const list = (plan.snapshots ??= []);
  const existing = list.find((s) => s.ym === ym);
  if (existing) {
    // Refresh the current month's figures; only report a change if they moved.
    const changed =
      existing.netWorth !== snap.netWorth ||
      existing.totalAssets !== snap.totalAssets ||
      existing.mfInvested !== snap.mfInvested ||
      existing.mfCurrent !== snap.mfCurrent;
    if (changed) Object.assign(existing, snap);
    return changed;
  }
  list.push(snap);
  list.sort((a, b) => a.ym.localeCompare(b.ym));
  // Keep the series bounded (last 60 months is plenty for a trend).
  if (list.length > 60) list.splice(0, list.length - 60);
  return true;
}

/**
 * Ensure a rich daily snapshot exists for today (net worth, per asset class,
 * stocks, MF value/invested), mutating `plan.daySnapshots` in place. Refreshes
 * today's figures each open; keeps ~2 years. Returns true if anything changed.
 */
export function captureDailySnapshot(plan: FinancialPlan, when: Date = new Date()): boolean {
  const d = dayKey(when);
  const tracked = trackedFundsByClass(plan.mutualFunds);
  const nw = computeNetWorth(
    plan.assets,
    plan.liabilities,
    plan.disabledClasses ?? [],
    plan.customClasses ?? [],
    tracked,
  );
  const mf = mfTotals(plan);
  const byClass: Record<string, number> = {};
  for (const c of nw.byClass) byClass[c.key] = Math.round(c.value);
  const stocks = Math.round((plan.assets.domesticEquity.stocks ?? []).reduce((s, r) => s + (Number(r.value) || 0), 0));
  const snap = {
    d,
    netWorth: Math.round(nw.netWorth),
    totalAssets: Math.round(nw.totalAssets),
    mfInvested: Math.round(mf.invested),
    mfValue: Math.round(mf.current),
    stocks,
    byClass,
  };

  const list = (plan.daySnapshots ??= []);
  const existing = list.find((s) => s.d === d);
  if (existing) {
    const changed = JSON.stringify(existing) !== JSON.stringify(snap);
    if (changed) Object.assign(existing, snap);
    return changed;
  }
  list.push(snap);
  list.sort((a, b) => a.d.localeCompare(b.d));
  if (list.length > 750) list.splice(0, list.length - 750);
  return true;
}
