//
// Mutual-fund returns math — pure, dependency-free, unit-tested.
//
// The right way to measure the return of a fund you drip money into (a SIP) is
// XIRR: the single annualized rate that makes all your dated cash flows net to
// zero. We also expose CAGR (annualized over the money-weighted average holding
// period) and the plain absolute return, and aggregate all three per fund, per
// category and across the whole MF portfolio.

import type { MFCategory, MFTransaction, MutualFundHolding } from '../types/models';

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
  const units = txns.reduce((s, t) => s + (Number(t.units) || 0), 0);
  const invested = txns.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const currentValue =
    currentValueOverride != null ? currentValueOverride : (Number(currentNav) || 0) * units;
  const gain = currentValue - invested;
  const dates = txns.map((t) => new Date(t.date).getTime()).filter((n) => Number.isFinite(n));
  const firstMs = dates.length ? Math.min(...dates) : null;

  const flows: Flow[] = txns
    .filter((t) => Number(t.amount) > 0)
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
