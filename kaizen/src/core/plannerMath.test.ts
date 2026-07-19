import { describe, it, expect } from 'vitest';
import { DEFAULT_HORIZONS } from '../types/models';
import type {
  AssetClassAssumption,
  CashFlow,
  CustomAssetClass,
  FinancialGoalRow,
  HoldingRow,
  Liabilities,
  MutualFundHolding,
  PlanAssets,
} from '../types/models';
import {
  computeCashFlow,
  effectiveReturns,
  horizonFor,
  goalTypeIdOf,
  amountRequiredFuture,
  sipRequired,
  computeNetWorth,
  totalLiabilities,
  activeAssumptions,
  assetClassTotals,
  trackedFundsByClass,
} from './plannerMath';

// --- test fixtures ---------------------------------------------------------

let idc = 0;
const row = (value: number, name = 'x'): HoldingRow => ({ id: `r${idc++}`, name, value });

/** The six built-in assumptions, mirroring plannerRepository defaults. */
function defaultAssumptions(): AssetClassAssumption[] {
  return [
    { key: 'domestic_equity', label: 'Domestic equity', expectedReturnPct: 12, weights: { short: 0, medium: 40, long: 60 } },
    { key: 'us_equity', label: 'US equity', expectedReturnPct: 12, weights: { short: 0, medium: 0, long: 10 } },
    { key: 'debt', label: 'Debt', expectedReturnPct: 6, weights: { short: 100, medium: 50, long: 15 } },
    { key: 'gold', label: 'Gold (SGB / ETF)', expectedReturnPct: 6, weights: { short: 0, medium: 10, long: 5 } },
    { key: 'crypto', label: 'Crypto', expectedReturnPct: 20, weights: { short: 0, medium: 0, long: 5 } },
    { key: 'real_estate', label: 'Real Estate / REITs', expectedReturnPct: 10, weights: { short: 0, medium: 0, long: 5 } },
  ];
}

function emptyAssets(): PlanAssets {
  return {
    realEstate: { home: 0, otherRealEstate: 0, reits: 0, others: [] },
    domesticEquity: { stocks: [], mutualFunds: [] },
    usEquity: { sp500Etf: 0, otherEtfs: 0, mutualFunds: 0, others: [] },
    debt: { liquidCash: 0, fds: [], debtFunds: [], epfPpfVpf: [] },
    gold: { jewellery: 0, sgb: 0, goldEtf: 0, others: [] },
    crypto: { crypto: 0, others: [] },
    misc: { ulips: 0, smallcase: 0 },
  };
}

const goal = (over: Partial<FinancialGoalRow> = {}): FinancialGoalRow => ({
  id: 'g1',
  name: 'Goal',
  yearsLeft: 5,
  amountRequiredToday: 0,
  amountAvailableToday: 0,
  inflationPct: 0,
  stepUpPct: 0,
  ...over,
});

// --- tests -----------------------------------------------------------------

describe('computeCashFlow', () => {
  it('sums inflows/outflows and derives surplus + 6x emergency fund', () => {
    const cf: CashFlow = { inflows: [row(100000), row(20000)], outflows: [row(50000), row(10000)] };
    const r = computeCashFlow(cf);
    expect(r.totalInflows).toBe(120000);
    expect(r.totalOutflows).toBe(60000);
    expect(r.investingSurplus).toBe(60000);
    expect(r.recommendedEmergencyFund).toBe(360000); // 6 x outflows
  });
});

describe('effectiveReturns (spreadsheet-faithful defaults)', () => {
  it('blends the weighted returns per goal type', () => {
    const eff = effectiveReturns(defaultAssumptions(), DEFAULT_HORIZONS);
    expect(eff.short).toBeCloseTo(0.06, 5); // 6.0%
    expect(eff.medium).toBeCloseTo(0.084, 5); // 8.4%
    expect(eff.long).toBeCloseTo(0.111, 5); // 11.1%
  });
});

describe('horizonFor (legacy year→type mapping used by migration)', () => {
  it('maps years-left onto the default maxYears buckets', () => {
    expect(horizonFor(2, DEFAULT_HORIZONS)).toBe('short'); // < 3
    expect(horizonFor(5, DEFAULT_HORIZONS)).toBe('medium'); // < 7
    expect(horizonFor(10, DEFAULT_HORIZONS)).toBe('long');
  });
});

describe('goalTypeIdOf', () => {
  it('uses the goal type if valid, else falls back to the first type', () => {
    expect(goalTypeIdOf(goal({ goalTypeId: 'long' }), DEFAULT_HORIZONS)).toBe('long');
    expect(goalTypeIdOf(goal({ goalTypeId: 'nope' }), DEFAULT_HORIZONS)).toBe(DEFAULT_HORIZONS[0].id);
    expect(goalTypeIdOf(goal({}), DEFAULT_HORIZONS)).toBe(DEFAULT_HORIZONS[0].id);
  });
});

describe('amountRequiredFuture', () => {
  it('returns 0 when nothing is needed', () => {
    expect(amountRequiredFuture(goal({ amountRequiredToday: 5000, amountAvailableToday: 5000 }), 0.1)).toBe(0);
  });
  it('inflates the required amount and subtracts the grown pot', () => {
    // 100000 grown 1y at 10% inflation, 0 available → 110000
    expect(amountRequiredFuture(goal({ yearsLeft: 1, amountRequiredToday: 100000, inflationPct: 10 }), 0)).toBeCloseTo(110000, 2);
  });
});

describe('sipRequired', () => {
  it('is 0 when there is no shortfall', () => {
    expect(sipRequired(0, 5, 0.1, 0)).toBe(0);
  });
  it('splits a zero-return target evenly across the months', () => {
    expect(sipRequired(1200, 1, 0, 0)).toBeCloseTo(100, 6); // 12 months
  });
});

describe('computeNetWorth', () => {
  const liabilities: Liabilities = { items: [row(300000)] };

  it('splits liquid vs illiquid and nets off liabilities', () => {
    const assets = emptyAssets();
    assets.realEstate.home = 1000000; // illiquid
    assets.debt.liquidCash = 200000; // liquid
    assets.domesticEquity.stocks = [row(50000)]; // liquid
    const nw = computeNetWorth(assets, liabilities);
    expect(nw.illiquid).toBe(1000000);
    expect(nw.liquid).toBe(250000);
    expect(nw.totalAssets).toBe(1250000);
    expect(nw.totalLiabilities).toBe(300000);
    expect(nw.netWorth).toBe(950000);
    expect(nw.byClass.find((c) => c.key === 'real_estate')?.value).toBe(1000000);
  });

  it('excludes a disabled class from every total', () => {
    const assets = emptyAssets();
    assets.realEstate.home = 1000000;
    assets.debt.liquidCash = 200000;
    const nw = computeNetWorth(assets, { items: [] }, ['real_estate']);
    expect(nw.totalAssets).toBe(200000);
    expect(nw.byClass.some((c) => c.key === 'real_estate')).toBe(false);
  });

  it('rolls a custom class into net worth per its liquid flag', () => {
    const custom: CustomAssetClass[] = [{ id: 'angel', label: 'Angel', liquid: true, holdings: [row(500000)] }];
    const nw = computeNetWorth(emptyAssets(), { items: [] }, [], custom);
    expect(nw.liquid).toBe(500000);
    expect(nw.totalAssets).toBe(500000);
    expect(nw.byClass.find((c) => c.key === 'angel')?.value).toBe(500000);
  });
});

describe('totalLiabilities / activeAssumptions / assetClassTotals', () => {
  it('sums liability items', () => {
    expect(totalLiabilities({ items: [row(100), row(250)] })).toBe(350);
  });
  it('filters disabled assumptions', () => {
    const active = activeAssumptions(defaultAssumptions(), ['crypto', 'gold']);
    expect(active.map((a) => a.key)).not.toContain('crypto');
    expect(active.map((a) => a.key)).not.toContain('gold');
    expect(active).toHaveLength(4);
  });
  it('reports per-class totals keyed by class', () => {
    const assets = emptyAssets();
    assets.debt.liquidCash = 200000;
    const totals = assetClassTotals(assets);
    expect(totals.debt).toBe(200000);
  });
});

describe('tracked funds (Funds tab) integration', () => {
  const fund = (category: MutualFundHolding['category'], units: number, nav: number): MutualFundHolding => ({
    id: `f${idc++}`,
    schemeCode: 100000 + idc,
    name: 'F',
    category,
    transactions: [{ id: `t${idc++}`, date: '2024-01-01', amount: units * nav, units, nav, kind: 'sip' }],
    latestNav: nav,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  });

  it('splits tracked value into domestic equity vs debt by category', () => {
    const t = trackedFundsByClass([fund('flexicap', 100, 20), fund('largecap', 50, 10), fund('debt', 100, 12)]);
    expect(t.domestic_equity).toBeCloseTo(2000 + 500, 6); // equity caps -> domestic equity
    expect(t.debt).toBeCloseTo(1200, 6);
  });

  it('handles no funds', () => {
    expect(trackedFundsByClass()).toEqual({ domestic_equity: 0, debt: 0 });
    expect(trackedFundsByClass([])).toEqual({ domestic_equity: 0, debt: 0 });
  });

  it('adds tracked value into net worth (domestic equity + debt)', () => {
    const assets = emptyAssets();
    assets.debt.liquidCash = 100000;
    const nwPlain = computeNetWorth(assets, { items: [] });
    const nwTracked = computeNetWorth(assets, { items: [] }, [], [], { domestic_equity: 300000, debt: 50000 });
    expect(nwTracked.totalAssets).toBe(nwPlain.totalAssets + 350000);
    const de = nwTracked.byClass.find((c) => c.key === 'domestic_equity');
    expect(de?.value).toBe(300000);
    const debt = nwTracked.byClass.find((c) => c.key === 'debt');
    expect(debt?.value).toBe(150000); // 100k liquid + 50k tracked
  });
});
