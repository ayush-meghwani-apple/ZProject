import { navOnOrBefore, type NavPoint } from './amfi';
import { xirr, type Flow, type ReturnSeries } from './mfReturns';
import type { MFTransaction } from '../types/models';

export interface WeightedNavHistory {
  points: NavPoint[];
  weight?: number;
}

export interface IndexedSeries {
  values: (number | null)[];
  sampleSize: number;
}

export interface WeightedIndexSeries {
  values: (number | null)[];
  weight: number;
}

export interface SimulatedBenchmarkLeg {
  points: NavPoint[];
  weight: number;
}

/** Simulate the same dated cash flows into TRI histories, then calculate XIRR. */
export function simulatedBenchmarkXirrSeries(
  transactions: MFTransaction[],
  legs: SimulatedBenchmarkLeg[],
  timestamps: number[],
  openingValue = 0,
): ReturnSeries {
  if (timestamps.length < 2 || !legs.length) {
    return { values: timestamps.map(() => null), returnPct: null };
  }
  const totalWeight = legs.reduce((sum, leg) => sum + Math.max(0, leg.weight), 0);
  if (totalWeight <= 0) return { values: timestamps.map(() => null), returnPct: null };

  const periodStart = timestamps[0];
  const settled = transactions
    .filter((transaction) => {
      const time = new Date(transaction.date).getTime();
      return !transaction.processing && Number.isFinite(time) && time > periodStart;
    })
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  const values = timestamps.map((time) => {
    const flows: Flow[] = [];
    if (openingValue > 0) flows.push({ date: new Date(periodStart), amount: -openingValue });
    let endingValue = 0;

    for (const leg of legs) {
      const weight = Math.max(0, leg.weight) / totalWeight;
      if (weight <= 0) continue;
      const openingNav = navOnOrBefore(leg.points, new Date(periodStart))?.nav;
      const endingNav = navOnOrBefore(leg.points, new Date(time))?.nav;
      if (!(endingNav && endingNav > 0) || (openingValue > 0 && !(openingNav && openingNav > 0))) return null;

      let units = openingValue > 0 ? (openingValue * weight) / openingNav! : 0;
      for (const transaction of settled) {
        const transactionTime = new Date(transaction.date).getTime();
        if (transactionTime > time) break;
        const amount = Number(transaction.amount) || 0;
        if (amount === 0) continue;
        const nav = navOnOrBefore(leg.points, new Date(transactionTime))?.nav;
        if (!(nav && nav > 0)) return null;
        units += (amount * weight) / nav;
      }
      endingValue += units * endingNav;
    }

    for (const transaction of settled) {
      const transactionTime = new Date(transaction.date).getTime();
      if (transactionTime > time) break;
      const amount = Number(transaction.amount) || 0;
      if (amount !== 0) flows.push({ date: new Date(transactionTime), amount: -amount });
    }
    if (endingValue > 0) flows.push({ date: new Date(time), amount: endingValue });
    const result = xirr(flows);
    return result != null && Number.isFinite(result) ? result * 100 : null;
  });
  const last = [...values].reverse().find((value): value is number => value != null);
  return { values, returnPct: last ?? null };
}

export function normalizedNavSeries(points: NavPoint[], timestamps: number[]): (number | null)[] {
  if (!timestamps.length) return [];
  const base = navOnOrBefore(points, new Date(timestamps[0]));
  if (!base?.nav) return timestamps.map(() => null);
  return timestamps.map((timestamp) => {
    const point = navOnOrBefore(points, new Date(timestamp));
    return point?.nav ? (point.nav / base.nav) * 100 : null;
  });
}

export function weightedNavIndex(histories: WeightedNavHistory[], timestamps: number[]): IndexedSeries {
  const usable = histories
    .map((history) => ({
      values: normalizedNavSeries(history.points, timestamps),
      weight: Math.max(0, Number(history.weight) || 0),
    }))
    .filter((history) => history.values[0] != null);
  if (!usable.length) return { values: timestamps.map(() => null), sampleSize: 0 };

  const hasPositiveWeight = usable.some((history) => history.weight > 0);
  const values = timestamps.map((_, index) => {
    let weightedTotal = 0;
    let totalWeight = 0;
    for (const history of usable) {
      const value = history.values[index];
      if (value == null) continue;
      const weight = hasPositiveWeight ? history.weight : 1;
      if (weight <= 0) continue;
      weightedTotal += value * weight;
      totalWeight += weight;
    }
    return totalWeight > 0 ? weightedTotal / totalWeight : null;
  });
  return { values, sampleSize: usable.length };
}

export function weightedSeriesAverage(series: WeightedIndexSeries[]): (number | null)[] {
  const length = Math.max(0, ...series.map((item) => item.values.length));
  return Array.from({ length }, (_, index) => {
    let weightedTotal = 0;
    let totalWeight = 0;
    for (const item of series) {
      const value = item.values[index];
      if (value == null || !Number.isFinite(value) || item.weight <= 0) continue;
      weightedTotal += value * item.weight;
      totalWeight += item.weight;
    }
    return totalWeight > 0 ? weightedTotal / totalWeight : null;
  });
}