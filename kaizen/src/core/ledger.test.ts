import { describe, it, expect } from 'vitest';
import type { FinancialPlan, LedgerEntry } from '../types/models';
import {
  assignableSubcats,
  subcatLabel,
  classHoldings,
  syncEntryHolding,
  removeEntryHolding,
  editPosition,
} from './ledger';

function plan(): FinancialPlan {
  return {
    id: 'default',
    v: 1,
    assumptions: [],
    cashFlow: { inflows: [], outflows: [] },
    assets: {
      realEstate: { home: 0, otherRealEstate: 0, reits: 0, others: [] },
      domesticEquity: { stocks: [], mutualFunds: [] },
      usEquity: { sp500Etf: 0, otherEtfs: 0, mutualFunds: 0, others: [] },
      debt: { liquidCash: 0, fds: [], debtFunds: [], epfPpfVpf: [] },
      gold: { jewellery: 0, sgb: 0, goldEtf: 0, others: [] },
      crypto: { crypto: 0, others: [] },
      misc: { ulips: 0, smallcase: 0 },
    },
    liabilities: { items: [] },
    goals: [],
    recurringInvestments: [],
    mutualFunds: [],
    ledger: [],
    snapshots: [],
    daySnapshots: [],
    horizons: [],
    customClasses: [],
    fixedLabels: {},
    disabledClasses: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as FinancialPlan;
}

function entry(over: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: 'e1',
    date: '2026-01-01T00:00:00.000Z',
    assetClassKey: 'debt',
    name: 'X',
    amount: 1000,
    kind: 'buy',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('assignableSubcats / subcatLabel', () => {
  it('offers sub-categories for built-in classes and none for custom', () => {
    expect(assignableSubcats('debt').map((s) => s.key)).toEqual(['liquid', 'fd', 'debtfund', 'epf']);
    expect(assignableSubcats('gold').length).toBe(4);
    expect(assignableSubcats('some-custom-id')).toEqual([]);
  });
  it('resolves a label (equity uses the Portfolio EQUITY_CATS strings)', () => {
    expect(subcatLabel('debt', 'fd')).toBe('Fixed deposit');
    expect(subcatLabel('domestic_equity', 'largecap')).toBe('Largecap');
    expect(subcatLabel('domestic_equity', 'flexicap')).toBe('Flexi/Multi cap');
    expect(subcatLabel('debt', undefined)).toBeUndefined();
  });
});

describe('classHoldings routing', () => {
  it('routes debt sub-categories to the matching bucket', () => {
    const p = plan();
    expect(classHoldings(p, 'debt', 'fd')).toBe(p.assets.debt.fds);
    expect(classHoldings(p, 'debt', 'epf')).toBe(p.assets.debt.epfPpfVpf);
    expect(classHoldings(p, 'debt', 'debtfund')).toBe(p.assets.debt.debtFunds);
    expect(classHoldings(p, 'debt', 'liquid')).toBe(p.assets.debt.debtFunds);
    expect(classHoldings(p, 'debt')).toBe(p.assets.debt.debtFunds);
  });
  it('routes other classes to their single array', () => {
    const p = plan();
    expect(classHoldings(p, 'domestic_equity', 'largecap')).toBe(p.assets.domesticEquity.stocks);
    expect(classHoldings(p, 'gold', 'jewellery')).toBe(p.assets.gold.others);
    expect(classHoldings(p, 'real_estate', 'home')).toBe(p.assets.realEstate.others);
  });
});

describe('syncEntryHolding', () => {
  it('creates a linked holding in the right bucket with a category tag', () => {
    const p = plan();
    const e = entry({ assetClassKey: 'debt', subKey: 'fd', name: 'SBI FD', amount: 50000 });
    syncEntryHolding(p, e);
    expect(e.holdingId).toBeTruthy();
    expect(p.assets.debt.fds).toHaveLength(1);
    expect(p.assets.debt.debtFunds).toHaveLength(0);
    expect(p.assets.debt.fds[0]).toMatchObject({ name: 'SBI FD', value: 50000, category: 'Fixed deposit' });
  });

  it('a sell files a negative value', () => {
    const p = plan();
    const e = entry({ assetClassKey: 'gold', subKey: 'jewellery', kind: 'sell', amount: 2000 });
    syncEntryHolding(p, e);
    expect(p.assets.gold.others[0].value).toBe(-2000);
  });

  it('editing the sub-category moves the holding to the new bucket (no duplicate)', () => {
    const p = plan();
    const e = entry({ assetClassKey: 'debt', subKey: 'fd', name: 'Reclassify', amount: 10000 });
    syncEntryHolding(p, e);
    const id = e.holdingId;
    // Now the user changes it to a debt fund.
    e.subKey = 'debtfund';
    syncEntryHolding(p, e);
    expect(p.assets.debt.fds).toHaveLength(0);
    expect(p.assets.debt.debtFunds).toHaveLength(1);
    expect(p.assets.debt.debtFunds[0].id).toBe(id);
    expect(p.assets.debt.debtFunds[0].category).toBe('Debt fund');
  });

  it('updates the same holding in place on a value edit', () => {
    const p = plan();
    const e = entry({ assetClassKey: 'us_equity', subKey: 'stock', name: 'AAPL', amount: 100 });
    syncEntryHolding(p, e);
    e.amount = 250;
    syncEntryHolding(p, e);
    expect(p.assets.usEquity.others).toHaveLength(1);
    expect(p.assets.usEquity.others[0].value).toBe(250);
  });
});

describe('removeEntryHolding', () => {
  it('removes the linked holding wherever it is filed', () => {
    const p = plan();
    const e = entry({ assetClassKey: 'debt', subKey: 'epf', name: 'EPF', amount: 300000 });
    syncEntryHolding(p, e);
    expect(p.assets.debt.epfPpfVpf).toHaveLength(1);
    removeEntryHolding(p, e);
    expect(p.assets.debt.epfPpfVpf).toHaveLength(0);
  });
});

describe('editPosition', () => {
  it('edits an array-row position (name / value / units)', () => {
    const p = plan();
    p.assets.domesticEquity.stocks.push({ id: 's1', name: 'Infy', value: 100, units: 1 });
    editPosition(p, { kind: 'row', classKey: 'domestic_equity', array: 'domesticEquity.stocks', id: 's1' }, { name: 'Infosys', value: 200, units: 2 });
    expect(p.assets.domesticEquity.stocks[0]).toMatchObject({ name: 'Infosys', value: 200, units: 2 });
  });

  it('edits a scalar position value', () => {
    const p = plan();
    p.assets.realEstate.home = 5000000;
    editPosition(p, { kind: 'scalar', path: 'realEstate.home' }, { value: 6000000 });
    expect(p.assets.realEstate.home).toBe(6000000);
  });

  it('ignores an unknown scalar path safely', () => {
    const p = plan();
    editPosition(p, { kind: 'scalar', path: 'nope.nope' }, { value: 1 });
    expect(p.assets.realEstate.home).toBe(0);
  });
});
