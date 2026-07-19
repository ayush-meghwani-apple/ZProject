import { describe, it, expect } from 'vitest';
import type { MFTransaction, MutualFundHolding } from '../types/models';
import { xirr, summarize, byCategory, poolSummary, type Flow } from './mfReturns';

// --- helpers ---------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const d = (iso: string) => new Date(iso);

let idc = 0;
function txn(date: string, amount: number, nav: number, units = amount / nav): MFTransaction {
  return { id: `t${idc++}`, date: d(date).toISOString(), amount, units, nav, kind: 'sip' };
}
function fund(category: MutualFundHolding['category'], nav: number, txns: MFTransaction[]): MutualFundHolding {
  return {
    id: `f${idc++}`,
    schemeCode: 100000 + idc,
    name: 'Test Fund',
    category,
    transactions: txns,
    latestNav: nav,
    createdAt: d('2020-01-01').toISOString(),
    updatedAt: d('2020-01-01').toISOString(),
  };
}

// --- xirr ------------------------------------------------------------------

describe('xirr', () => {
  it('returns ~10% for a lumpsum that grows 10% in exactly one year', () => {
    const flows: Flow[] = [
      { date: d('2024-01-01'), amount: -1000 },
      { date: d('2025-01-01'), amount: 1100 },
    ];
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 3);
  });

  it('returns ~0 when value equals money in', () => {
    const flows: Flow[] = [
      { date: d('2024-01-01'), amount: -1000 },
      { date: d('2025-01-01'), amount: 1000 },
    ];
    expect(xirr(flows)!).toBeCloseTo(0, 4);
  });

  it('handles a doubling over one year (~100%)', () => {
    const flows: Flow[] = [
      { date: d('2024-01-01'), amount: -500 },
      { date: d('2025-01-01'), amount: 1000 },
    ];
    expect(xirr(flows)!).toBeCloseTo(1.0, 2);
  });

  it('is null when all flows share a sign', () => {
    expect(
      xirr([
        { date: d('2024-01-01'), amount: -100 },
        { date: d('2025-01-01'), amount: -100 },
      ]),
    ).toBeNull();
  });

  it('is null with fewer than two flows', () => {
    expect(xirr([{ date: d('2024-01-01'), amount: -100 }])).toBeNull();
  });

  it('computes a positive XIRR for a monthly SIP that ends up ahead', () => {
    // 12 monthly buys of 1000, then valued at 13000 a month after the last.
    const flows: Flow[] = [];
    const start = d('2024-01-01').getTime();
    for (let i = 0; i < 12; i++) flows.push({ date: new Date(start + i * 30 * DAY), amount: -1000 });
    flows.push({ date: new Date(start + 12 * 30 * DAY), amount: 13000 });
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0);
    expect(r!).toBeLessThan(1); // sane, not exploded
  });
});

// --- summarize -------------------------------------------------------------

describe('summarize', () => {
  it('computes units, invested, value, gain and absolute return', () => {
    const txns = [txn('2024-01-01', 1000, 10), txn('2024-02-01', 1000, 12.5)];
    // units = 100 + 80 = 180; at NAV 15 -> value 2700; invested 2000; gain 700
    const s = summarize(txns, 15, d('2025-01-01'));
    expect(s.units).toBeCloseTo(180, 6);
    expect(s.invested).toBe(2000);
    expect(s.currentValue).toBeCloseTo(2700, 6);
    expect(s.gain).toBeCloseTo(700, 6);
    expect(s.absReturnPct!).toBeCloseTo(35, 6);
    expect(s.xirrPct).not.toBeNull();
    expect(s.cagrPct).not.toBeNull();
  });

  it('honours a current-value override (for pooled aggregates)', () => {
    const txns = [txn('2024-01-01', 1000, 10)];
    const s = summarize(txns, undefined, d('2025-01-01'), 1500);
    expect(s.currentValue).toBe(1500);
    expect(s.gain).toBe(500);
  });

  it('gives null returns when nothing is invested', () => {
    const s = summarize([], 15);
    expect(s.invested).toBe(0);
    expect(s.currentValue).toBe(0);
    expect(s.absReturnPct).toBeNull();
    expect(s.xirrPct).toBeNull();
  });
});

// --- aggregation -----------------------------------------------------------

describe('byCategory / poolSummary', () => {
  it('groups funds by category and totals across the portfolio', () => {
    const large = fund('largecap', 20, [txn('2024-01-01', 1000, 10)]); // 100u -> 2000
    const mid = fund('midcap', 30, [txn('2024-01-01', 1000, 15)]); // ~66.67u -> 2000
    const { groups, total } = byCategory([large, mid], d('2025-01-01'));
    expect(groups).toHaveLength(2);
    // invested is 2000 total (1000 + 1000), value ~4000 (2000 + 2000)
    expect(total.invested).toBe(2000);
    expect(total.currentValue).toBeCloseTo(4000, 6);
  });

  it('pools transactions for a blended XIRR', () => {
    const a = fund('largecap', 20, [txn('2024-01-01', 1000, 10)]);
    const b = fund('smallcap', 30, [txn('2024-07-01', 1000, 15)]);
    const s = poolSummary([a, b], d('2025-01-01'));
    expect(s.invested).toBe(2000);
    expect(s.currentValue).toBeCloseTo(4000, 6);
    expect(s.xirrPct).not.toBeNull();
    expect(s.xirrPct!).toBeGreaterThan(0);
  });
});
