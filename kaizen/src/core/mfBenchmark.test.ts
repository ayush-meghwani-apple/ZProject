import { describe, expect, it } from 'vitest';
import type { NavPoint } from './amfi';
import { normalizedNavSeries, weightedNavIndex, weightedSeriesAverage } from './mfBenchmark';

function history(entries: [string, number][]): NavPoint[] {
  return entries
    .map(([dateText, nav]) => {
      const date = new Date(`${dateText}T00:00:00`);
      return { date, iso: date.toISOString(), nav };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

const timestamps = ['2025-01-01', '2025-01-02', '2025-01-03'].map((date) => new Date(`${date}T00:00:00`).getTime());

describe('normalizedNavSeries', () => {
  it('rebases NAVs to 100 and carries the previous NAV over missing dates', () => {
    const points = history([['2025-01-01', 20], ['2025-01-03', 22]]);
    expect(normalizedNavSeries(points, timestamps)).toEqual([100, 100, 110.00000000000001]);
  });

  it('returns gaps when the scheme has no NAV at the range start', () => {
    expect(normalizedNavSeries(history([['2025-01-02', 20]]), timestamps)).toEqual([null, null, null]);
  });
});

describe('weightedNavIndex', () => {
  it('builds an equal-weight peer average when no weights are supplied', () => {
    const result = weightedNavIndex([
      { points: history([['2025-01-01', 10], ['2025-01-03', 12]]) },
      { points: history([['2025-01-01', 20], ['2025-01-03', 22]]) },
    ], timestamps);
    expect(result.sampleSize).toBe(2);
    expect(result.values[2]).toBeCloseTo(115);
  });

  it('uses supplied allocation weights and excludes histories without a baseline', () => {
    const result = weightedNavIndex([
      { points: history([['2025-01-01', 10], ['2025-01-03', 11]]), weight: 3 },
      { points: history([['2025-01-01', 10], ['2025-01-03', 15]]), weight: 1 },
      { points: history([['2025-01-02', 10], ['2025-01-03', 30]]), weight: 10 },
    ], timestamps);
    expect(result.sampleSize).toBe(2);
    expect(result.values[2]).toBeCloseTo(120);
  });
});

describe('weightedSeriesAverage', () => {
  it('blends exact-category benchmarks by the held allocation', () => {
    expect(weightedSeriesAverage([
      { values: [100, 110], weight: 3 },
      { values: [100, 90], weight: 1 },
    ])).toEqual([100, 105]);
  });
});