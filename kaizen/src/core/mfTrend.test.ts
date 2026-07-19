import { describe, it, expect } from 'vitest';
import { mfMonthlyTrend } from './mfTrend';
import type { NavPoint } from './amfi';
import type { MutualFundHolding } from '../types/models';

function navPoints(entries: [string, number][]): NavPoint[] {
  // entries: ["yyyy-mm-dd", nav]; return newest-first as fetchNavHistory does.
  return entries
    .map(([d, nav]) => {
      const [y, m, day] = d.split('-').map(Number);
      const date = new Date(y, m - 1, day);
      return { date, iso: date.toISOString(), nav };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

const fund = (over: Partial<MutualFundHolding>): MutualFundHolding => ({
  id: 'f1',
  schemeCode: 100,
  name: 'Test Fund',
  category: 'flexicap',
  transactions: [],
  latestNav: 12,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...over,
});

describe('mfMonthlyTrend', () => {
  it('returns an empty series when there are no funds or no transactions', () => {
    expect(mfMonthlyTrend([], {})).toEqual([]);
    expect(mfMonthlyTrend([fund({})], {})).toEqual([]);
  });

  it('accumulates invested and values units at each month-end NAV', () => {
    const f = fund({
      transactions: [
        { id: 't1', date: new Date(2025, 0, 10).toISOString(), amount: 1000, units: 100, nav: 10, kind: 'sip' },
        { id: 't2', date: new Date(2025, 1, 10).toISOString(), amount: 1000, units: 90.9, nav: 11, kind: 'sip' },
      ],
    });
    const navs = { 100: navPoints([['2025-01-31', 10.5], ['2025-02-28', 11.5], ['2025-03-15', 12]]) };
    const trend = mfMonthlyTrend([f], navs, 12, new Date(2025, 2, 15));
    expect(trend.map((p) => p.ym)).toEqual(['2025-01', '2025-02', '2025-03']);
    // Jan: 100 units @ 10.5 = 1050 invested 1000
    expect(trend[0]).toMatchObject({ invested: 1000, value: 1050 });
    // Feb: 190.9 units @ 11.5 ≈ 2195, invested 2000
    expect(trend[1].invested).toBe(2000);
    expect(trend[1].value).toBeGreaterThan(2100);
  });

  it('falls back to latest cached NAV when history is missing (offline)', () => {
    const f = fund({
      latestNav: 20,
      transactions: [{ id: 't1', date: new Date(2025, 0, 10).toISOString(), amount: 1000, units: 100, nav: 10, kind: 'lumpsum' }],
    });
    const trend = mfMonthlyTrend([f], {}, 12, new Date(2025, 0, 20));
    expect(trend[trend.length - 1].value).toBe(2000); // 100 × 20
  });
});
