import { describe, it, expect } from 'vitest';
import type { MFTransaction, MutualFundHolding } from '../types/models';
import { computeHarvest, financialYear, isEquityCategory } from './taxHarvest';

let idc = 0;
function txn(date: string, units: number, nav: number, kind: MFTransaction['kind'] = 'lumpsum'): MFTransaction {
  // Buys: positive units/amount. Redeems: negative units/amount (= −proceeds).
  const amount = units * nav;
  return { id: `t${idc++}`, date, units, nav, amount, kind };
}
function fund(over: Partial<MutualFundHolding>): MutualFundHolding {
  return {
    id: 'f1',
    schemeCode: 1,
    name: 'Test Equity Fund',
    category: 'flexicap',
    transactions: [],
    latestNav: 100,
    createdAt: '2020-01-01',
    updatedAt: '2020-01-01',
    ...over,
  };
}

// A fixed "today" so age math is deterministic.
const ASOF = new Date('2026-03-15T00:00:00.000Z');

describe('financialYear', () => {
  it('maps a March date to the FY ending that March', () => {
    expect(financialYear(new Date('2026-03-15')).label).toBe('2025–26');
  });
  it('maps an April date to the new FY', () => {
    expect(financialYear(new Date('2026-04-02')).label).toBe('2026–27');
  });
});

describe('isEquityCategory', () => {
  it('excludes debt, includes the rest', () => {
    expect(isEquityCategory('debt')).toBe(false);
    expect(isEquityCategory('flexicap')).toBe(true);
    expect(isEquityCategory('hybrid')).toBe(true);
  });
});

describe('computeHarvest — long/short split', () => {
  it('counts only units held > 1 year as long-term', () => {
    const f = fund({
      latestNav: 200,
      transactions: [
        txn('2023-01-01', 100, 100), // ~3yr old → long-term, gain 100×(200−100)=10000
        txn('2026-01-01', 50, 180), // ~2.5mo old → short-term
      ],
    });
    const plan = computeHarvest([f], { asOf: ASOF });
    const fv = plan.funds[0];
    expect(fv.longTermUnits).toBe(100);
    expect(fv.longTermGain).toBe(10000);
    expect(fv.shortTermUnits).toBe(50);
    // short-term gain = 50×(200−180)=1000
    expect(fv.shortTermGain).toBeCloseTo(1000, 4);
  });

  it('excludes debt funds entirely', () => {
    const f = fund({ category: 'debt', latestNav: 200, transactions: [txn('2020-01-01', 100, 100)] });
    const plan = computeHarvest([f], { asOf: ASOF });
    expect(plan.funds).toHaveLength(0);
    expect(plan.totalLongTermGain).toBe(0);
  });
});

describe('computeHarvest — holdings breakdown (long vs short)', () => {
  it('reports every equity fund with a long/short split and when the next lot matures', () => {
    const f = fund({
      latestNav: 200,
      transactions: [
        txn('2023-01-01', 100, 100), // long-term
        txn('2026-01-10', 50, 180), // short-term (oldest short lot)
      ],
    });
    const plan = computeHarvest([f], { asOf: ASOF });
    expect(plan.holdings).toHaveLength(1);
    const h = plan.holdings[0];
    expect(h.longTermUnits).toBe(100);
    expect(h.longTermValue).toBe(20000); // 100 × 200
    expect(h.costValue).toBe(19000); // 100×100 + 50×180
    expect(h.longTermCost).toBe(10000); // 100×100
    expect(h.shortTermUnits).toBe(50);
    expect(h.shortTermValue).toBe(10000); // 50 × 200
    // The 2026-01-10 lot turns "safely long-term" a year + 25-day buffer later.
    expect(h.nextLongTermDate?.slice(0, 10)).toBe('2027-02-04');
    expect(h.nextLongTermUnits).toBe(50);
  });

  it('debt funds are absent from holdings', () => {
    const eq = fund({ id: 'e', latestNav: 120, transactions: [txn('2023-01-01', 10, 100)] });
    const dt = fund({ id: 'd', category: 'debt', latestNav: 120, transactions: [txn('2023-01-01', 10, 100)] });
    const plan = computeHarvest([eq, dt], { asOf: ASOF });
    expect(plan.holdings.map((h) => h.fundId)).toEqual(['e']);
  });
});

describe('computeHarvest — 12-month + buffer safety window', () => {
  it('a lot just over 12 months but inside the buffer is still short-term', () => {
    // ~370 days before ASOF (2026-03-15) → past 365 but inside the 25-day buffer.
    const f = fund({ latestNav: 200, transactions: [txn('2025-03-10', 100, 100)] });
    const plan = computeHarvest([f], { asOf: ASOF });
    expect(plan.holdings[0].longTermUnits).toBe(0);
    expect(plan.holdings[0].shortTermUnits).toBe(100);
  });
  it('a lot well past 12 months + buffer is long-term', () => {
    const f = fund({ latestNav: 200, transactions: [txn('2025-01-01', 100, 100)] }); // ~438 days
    const plan = computeHarvest([f], { asOf: ASOF });
    expect(plan.holdings[0].longTermUnits).toBe(100);
  });
});

describe('computeHarvest — strategy exhausts the biggest-gain fund first', () => {
  it('fills the allowance from the highest-gain fund before touching others', () => {
    const big = fund({ id: 'big', name: 'Big', latestNav: 300, transactions: [txn('2023-01-01', 2000, 100)] }); // gain 400000
    const small = fund({ id: 'small', name: 'Small', latestNav: 150, transactions: [txn('2023-01-01', 100, 100)] }); // gain 5000
    const plan = computeHarvest([big, small], { asOf: ASOF });
    const bigV = plan.funds.find((f) => f.fundId === 'big')!;
    const smallV = plan.funds.find((f) => f.fundId === 'small')!;
    // ₹1.25L allowance is fully realised from 'big'; 'small' is left untouched.
    expect(bigV.sellGain).toBeCloseTo(125000, 2);
    expect(smallV.sellGain).toBe(0);
  });
});

describe('computeHarvest — FIFO redeems', () => {
  it('sells oldest units first and records realised LTCG within the FY', () => {
    const f = fund({
      latestNav: 300,
      transactions: [
        txn('2022-01-01', 100, 100), // oldest
        txn('2023-06-01', 100, 150),
        // Redeem 100 units in May 2025 at NAV 250 → consumes the 2022 lot (LT).
        txn('2025-05-01', -100, 250, 'redeem'),
      ],
    });
    const plan = computeHarvest([f], { asOf: ASOF });
    // Realised LT gain this FY (2025–26): 100×(250−100) = 15000.
    expect(plan.realizedLtcgThisFy).toBeCloseTo(15000, 4);
    expect(plan.remainingExemption).toBeCloseTo(125000 - 15000, 4);
    // Remaining holding = the 2023 lot (100 units): value 100×300=30000, gain 100×(300−150)=15000.
    const fv = plan.funds[0];
    expect(fv.currentUnits).toBeCloseTo(100, 4);
    expect(fv.longTermGain).toBeCloseTo(15000, 4);
  });

  it('a redeem outside the FY does not touch this FY allowance', () => {
    const f = fund({
      latestNav: 300,
      transactions: [
        txn('2022-01-01', 100, 100),
        txn('2024-05-01', -100, 250, 'redeem'), // prior FY (2024–25)
      ],
    });
    const plan = computeHarvest([f], { asOf: ASOF });
    expect(plan.realizedLtcgThisFy).toBe(0);
    expect(plan.remainingExemption).toBe(125000);
  });
});

describe('computeHarvest — suggestion fits the free allowance', () => {
  it('caps the suggested gain at the remaining exemption (partial lot)', () => {
    // One huge long-term lot with 500000 gain; suggestion should stop at 125000.
    const f = fund({
      latestNav: 200,
      transactions: [txn('2023-01-01', 5000, 100)], // gain = 5000×(200−100)=500000
    });
    const plan = computeHarvest([f], { asOf: ASOF });
    expect(plan.totalSuggestedGain).toBeCloseTo(125000, 2);
    const fv = plan.funds[0];
    // gainPerUnit = 100 → units to sell = 125000/100 = 1250; proceeds = 1250×200 = 250000
    expect(fv.sellUnits).toBeCloseTo(1250, 2);
    expect(fv.sellProceeds).toBeCloseTo(250000, 2);
  });

  it('suggests selling everything when total LT gain is under the limit', () => {
    const f = fund({
      latestNav: 120,
      transactions: [txn('2023-01-01', 100, 100)], // gain 2000, well under limit
    });
    const plan = computeHarvest([f], { asOf: ASOF });
    expect(plan.totalSuggestedGain).toBeCloseTo(2000, 4);
    expect(plan.funds[0].sellUnits).toBeCloseTo(100, 4);
  });

  it('leaves no suggestion once the FY allowance is already used up', () => {
    const f = fund({
      latestNav: 300,
      transactions: [
        txn('2020-01-01', 2000, 100),
        // Big LT redeem this FY realising >1.25L already.
        txn('2025-06-01', -1000, 250, 'redeem'), // 1000×(250−100)=150000 LT gain
      ],
    });
    const plan = computeHarvest([f], { asOf: ASOF });
    expect(plan.remainingExemption).toBe(0);
    expect(plan.totalSuggestedGain).toBe(0);
  });
});
