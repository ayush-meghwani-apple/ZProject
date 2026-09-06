import { navOnOrBefore, type NavPoint } from './amfi';

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