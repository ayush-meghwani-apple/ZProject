import { describe, expect, it } from 'vitest';
import type { MFTransaction } from '../types/models';
import type { NavPoint } from './amfi';
import { xirr } from './mfReturns';
import { normalizedNavSeries, simulatedBenchmarkXirrSeries, weightedNavIndex, weightedSeriesAverage } from './mfBenchmark';

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

  it('reproduces the 40/30/30 blended benchmark return example', () => {
    const blend = weightedSeriesAverage([
      { values: [100, 112], weight: 0.4 },
      { values: [100, 115], weight: 0.3 },
      { values: [100, 118], weight: 0.3 },
    ]);
    expect(blend[1]).toBeCloseTo(114.7);
    expect((blend[1] ?? 100) - 100).toBeCloseTo(14.7);
  });
});

describe('simulatedBenchmarkXirrSeries', () => {
  it('invests each SIP cash flow at the benchmark value on that exact day', () => {
    const transactions: MFTransaction[] = [
      { id: 'b', date: '2024-07-01T00:00:00.000Z', amount: 1000, units: 100, nav: 10, kind: 'sip' },
    ];
    const points = history([
      ['2024-01-01', 100],
      ['2024-07-01', 110],
      ['2025-01-01', 121],
    ]);
    const result = simulatedBenchmarkXirrSeries(
      transactions,
      [{ points, weight: 1 }],
      [new Date('2024-01-01T00:00:00').getTime(), new Date('2025-01-01T00:00:00').getTime()],
      1000,
    );

    const expected = 100 * xirr([
      { date: new Date('2024-01-01T00:00:00'), amount: -1000 },
      { date: new Date('2024-07-01T00:00:00.000Z'), amount: -1000 },
      { date: new Date('2025-01-01T00:00:00'), amount: 2310 },
    ])!;
    expect(result.returnPct).toBeCloseTo(expected, 8);
  });

  it('splits aggregate cash flows by current benchmark allocation', () => {
    const transactions: MFTransaction[] = [
      { id: 'a', date: '2024-01-02T00:00:00.000Z', amount: 1000, units: 100, nav: 10, kind: 'lumpsum' },
    ];
    const result = simulatedBenchmarkXirrSeries(
      transactions,
      [
        { points: history([['2024-01-01', 100], ['2025-01-01', 110]]), weight: 0.75 },
        { points: history([['2024-01-01', 100], ['2025-01-01', 130]]), weight: 0.25 },
      ],
      [new Date('2024-01-01T00:00:00').getTime(), new Date('2025-01-01T00:00:00').getTime()],
    );

    expect(result.returnPct).toBeCloseTo(15.01, 2);
  });

  it('sells simulated units for a redemption and treats it as money returned', () => {
    const transactions: MFTransaction[] = [
      { id: 'sell', date: '2024-07-01T00:00:00.000Z', amount: -550, units: -50, nav: 11, kind: 'redeem' },
    ];
    const result = simulatedBenchmarkXirrSeries(
      transactions,
      [{ points: history([['2024-01-01', 100], ['2024-07-01', 110], ['2025-01-01', 121]]), weight: 1 }],
      [new Date('2024-01-01T00:00:00').getTime(), new Date('2025-01-01T00:00:00').getTime()],
      1000,
    );

    expect(result.returnPct).toBeCloseTo(20.94, 1);
  });
});