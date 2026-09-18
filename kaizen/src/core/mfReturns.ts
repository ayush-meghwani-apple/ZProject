//
// Mutual-fund returns math — pure, dependency-free, unit-tested.
//
// The right way to measure the return of a fund you drip money into (a SIP) is
// XIRR: the single annualized rate that makes all your dated cash flows net to
// zero. We also expose CAGR (annualized over the money-weighted average holding
// period) and the plain absolute return, and aggregate all three per fund, per
// category and across the whole MF portfolio.

import type { MFCategory, MFTransaction, MutualFundHolding } from '../types/models';
import { navOnOrBefore, type NavPoint } from './amfi';

export interface Flow {
  date: Date;
  amount: number; // money OUT of pocket is negative; money/value IN is positive
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

/**
 * XIRR — the annualized internal rate of return for irregular, dated cash flows.
 * Returns a decimal (0.12 = 12%/yr), or null if it can't be solved (e.g. all
 * flows one sign, or fewer than two). Newton–Raphson with a bisection fallback.
 */
export function xirr(flows: Flow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null;

  const t0 = Math.min(...flows.map((f) => f.date.getTime()));
  if (Math.max(...flows.map((f) => f.date.getTime())) <= t0) return null;
  const yearsOf = (t: number) => (t - t0) / MS_PER_YEAR;

  const npv = (r: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, yearsOf(f.date.getTime())), 0);
  const dNpv = (r: number) =>
    flows.reduce((s, f) => {
      const y = yearsOf(f.date.getTime());
      return s - (y * f.amount) / Math.pow(1 + r, y + 1);
    }, 0);

  // Newton–Raphson.
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const value = npv(r);
    const deriv = dNpv(r);
    if (!Number.isFinite(value) || !Number.isFinite(deriv) || deriv === 0) break;
    let next = r - value / deriv;
    if (!Number.isFinite(next)) break;
    if (next <= -0.999999) next = -0.999999; // rate can't go below -100%
    if (Math.abs(next - r) < 1e-8) return next;
    r = next;
  }

  // Bisection fallback on a wide bracket.
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < 1e-8) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

export interface ReturnSummary {
  units: number;
  invested: number; // total put in
  currentValue: number; // units × latest NAV
  gain: number; // currentValue − invested
  absReturnPct: number | null; // gain / invested × 100
  xirrPct: number | null; // annualized, money-weighted
  cagrPct: number | null; // annualized over the invested-weighted avg holding period
  firstDate: Date | null;
  txnCount: number;
}

/** Invested-weighted average purchase date (in ms). Weights each buy by its
 *  amount, so a big lumpsum pulls the "average money-in date" toward it. */
function weightedAvgDateMs(txns: MFTransaction[]): number | null {
  let wSum = 0;
  let awSum = 0;
  for (const t of txns) {
    const w = t.amount;
    if (!(w > 0)) continue;
    wSum += w;
    awSum += w * new Date(t.date).getTime();
  }
  return wSum > 0 ? awSum / wSum : null;
}

/** Build a returns summary from a set of buy transactions + a current NAV,
 *  as of `asOf` (defaults to now). Also used for aggregates by feeding it the
 *  pooled transactions and a blended "value" via `currentValueOverride`. */
export function summarize(
  txns: MFTransaction[],
  currentNav: number | undefined,
  asOf: Date = new Date(),
  currentValueOverride?: number,
): ReturnSummary {
  // Pending SIP installments (scheduled on a weekend/holiday, allotted on the
  // next working day) aren't executed yet — leave them out of all money math
  // until their NAV lands and they settle.
  txns = txns.filter((t) => !t.processing);
  const units = txns.reduce((s, t) => s + (Number(t.units) || 0), 0);
  const invested = txns.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const currentValue =
    currentValueOverride != null ? currentValueOverride : (Number(currentNav) || 0) * units;
  const gain = currentValue - invested;
  const dates = txns.map((t) => new Date(t.date).getTime()).filter((n) => Number.isFinite(n));
  const firstMs = dates.length ? Math.min(...dates) : null;

  const flows: Flow[] = txns
    .filter((t) => Number(t.amount) !== 0)
    .map((t) => ({ date: new Date(t.date), amount: -Number(t.amount) }));
  if (currentValue > 0) flows.push({ date: asOf, amount: currentValue });
  const xr = flows.length >= 2 ? xirr(flows) : null;

  let cagr: number | null = null;
  const avgMs = weightedAvgDateMs(txns);
  if (avgMs != null && invested > 0 && currentValue > 0) {
    const years = (asOf.getTime() - avgMs) / MS_PER_YEAR;
    if (years > 0.02) cagr = Math.pow(currentValue / invested, 1 / years) - 1;
  }

  return {
    units,
    invested,
    currentValue,
    gain,
    absReturnPct: invested > 0 ? (gain / invested) * 100 : null,
    xirrPct: xr != null ? xr * 100 : null,
    cagrPct: cagr != null ? cagr * 100 : null,
    firstDate: firstMs != null ? new Date(firstMs) : null,
    txnCount: txns.length,
  };
}

/** Current value of one fund (units × its cached/live NAV). */
export function fundValue(fund: MutualFundHolding): number {
  const units = fund.transactions.reduce((s, t) => s + (Number(t.units) || 0), 0);
  return units * (Number(fund.latestNav) || 0);
}

/** Per-fund summary using the fund's own latest NAV. */
export function fundSummary(fund: MutualFundHolding, asOf: Date = new Date()): ReturnSummary {
  return summarize(fund.transactions, fund.latestNav, asOf);
}

export interface GroupSummary<K> {
  key: K;
  funds: MutualFundHolding[];
  summary: ReturnSummary;
}

/** Pool several funds into one summary. Each fund's current value uses its OWN
 *  NAV (funds have different NAVs), so we pass the summed value as an override
 *  while pooling every transaction for the XIRR/CAGR cash-flow timeline. */
export function poolSummary(funds: MutualFundHolding[], asOf: Date = new Date()): ReturnSummary {
  const txns = funds.flatMap((f) => f.transactions);
  const value = funds.reduce((s, f) => s + fundValue(f), 0);
  return summarize(txns, undefined, asOf, value);
}

function dayStart(time: number): number {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function fundValueAt(
  fund: MutualFundHolding,
  points: NavPoint[],
  time: number,
): number {
  const settled = fund.transactions.filter(
    (transaction) => !transaction.processing && new Date(transaction.date).getTime() <= time,
  );
  const units = settled.reduce((sum, transaction) => sum + (Number(transaction.units) || 0), 0);
  if (units === 0) return 0;
  const published = navOnOrBefore(points, new Date(time))?.nav;
  const transactionNav = [...settled]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .find((transaction) => Number(transaction.nav) > 0)?.nav;
  const nav = Number(published) || Number(transactionNav) || 0;
  return units * nav;
}

/** Value all selected funds at a historical instant using each fund's own NAV. */
export function mfPortfolioValueAt(
  funds: MutualFundHolding[],
  navs: Record<number, NavPoint[]>,
  time: number,
): number {
  return funds.reduce(
    (sum, fund) => sum + fundValueAt(fund, navs[fund.schemeCode] ?? [], time),
    0,
  );
}

export interface ReturnSeries {
  values: (number | null)[];
  returnPct: number | null;
}

/**
 * True time-weighted return for a fund or a pooled category/portfolio.
 * Daily subperiod returns remove that day's net external cash flow before they
 * are geometrically linked, so contribution timing cannot inflate performance.
 */
export function timeWeightedReturnSeries(
  funds: MutualFundHolding[],
  navs: Record<number, NavPoint[]>,
  timestamps: number[],
): ReturnSeries {
  if (!funds.length || timestamps.length < 2) return { values: timestamps.map(() => null), returnPct: null };
  const targets = timestamps.map(dayStart);
  const firstDay = targets[0];
  const lastDay = targets[targets.length - 1];
  const flowsByDay = new Map<number, number>();
  for (const fund of funds) {
    for (const transaction of fund.transactions) {
      if (transaction.processing) continue;
      const time = new Date(transaction.date).getTime();
      if (!Number.isFinite(time)) continue;
      const day = dayStart(time);
      flowsByDay.set(day, (flowsByDay.get(day) ?? 0) + (Number(transaction.amount) || 0));
    }
  }

  let previousValue = mfPortfolioValueAt(funds, navs, firstDay);
  let index = previousValue > 0 ? 100 : null;
  const dailyIndex = new Map<number, number | null>([[firstDay, index]]);
  for (let day = firstDay + 86_400_000; day <= lastDay; day += 86_400_000) {
    const value = mfPortfolioValueAt(funds, navs, day);
    const flow = flowsByDay.get(day) ?? 0;
    if (previousValue > 0 && index != null) {
      const factor = (value - flow) / previousValue;
      index = Number.isFinite(factor) && factor >= 0 ? index * factor : null;
    } else if (value > 0) {
      index = 100;
    }
    dailyIndex.set(day, index);
    previousValue = value;
  }
  const values = targets.map((target) => {
    const value = dailyIndex.get(target);
    return value == null ? null : value - 100;
  });
  const last = [...values].reverse().find((value): value is number => value != null);
  return { values, returnPct: last ?? null };
}

/** Pooled XIRR at every graph timestamp; transactions/funds are never averaged. */
export function moneyWeightedReturnSeries(
  funds: MutualFundHolding[],
  navs: Record<number, NavPoint[]>,
  timestamps: number[],
): ReturnSeries {
  const periodStart = timestamps[0];
  const openingValue = periodStart == null ? 0 : mfPortfolioValueAt(funds, navs, periodStart);
  const values = timestamps.map((time) => {
    const transactions = funds.flatMap((fund) =>
      fund.transactions.filter(
        (transaction) => {
          const transactionTime = new Date(transaction.date).getTime();
          return !transaction.processing && transactionTime > periodStart && transactionTime <= time;
        },
      ),
    );
    const currentValue = mfPortfolioValueAt(funds, navs, time);
    const flows: Flow[] = transactions
      .filter((transaction) => Number(transaction.amount) !== 0)
      .map((transaction) => ({ date: new Date(transaction.date), amount: -Number(transaction.amount) }));
    if (openingValue > 0) flows.unshift({ date: new Date(periodStart), amount: -openingValue });
    if (currentValue > 0) flows.push({ date: new Date(time), amount: currentValue });
    const result = xirr(flows);
    return result != null && Number.isFinite(result) ? result * 100 : null;
  });
  const last = [...values].reverse().find((value): value is number => value != null);
  return { values, returnPct: last ?? null };
}

/** Group funds by category and summarize each group (plus the pooled totals). */
export function byCategory(
  funds: MutualFundHolding[],
  asOf: Date = new Date(),
): { groups: GroupSummary<MFCategory>[]; total: ReturnSummary } {
  const map = new Map<MFCategory, MutualFundHolding[]>();
  for (const f of funds) {
    const list = map.get(f.category) ?? [];
    list.push(f);
    map.set(f.category, list);
  }
  const groups: GroupSummary<MFCategory>[] = [];
  for (const [key, list] of map) groups.push({ key, funds: list, summary: poolSummary(list, asOf) });
  // Biggest holdings first.
  groups.sort((a, b) => b.summary.currentValue - a.summary.currentValue);
  return { groups, total: poolSummary(funds, asOf) };
}
