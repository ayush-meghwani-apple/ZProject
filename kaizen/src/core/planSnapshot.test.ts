import { describe, expect, it } from 'vitest';
import type { FinancialPlan } from '../types/models';
import { assetValueHistory } from './planSnapshot';

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
    updatedAt: '',
  };
}

describe('assetValueHistory', () => {
  it('shows a confirmed SIP increase on its investment date and ends at live total assets', () => {
    const value = plan();
    value.mutualFunds = [{
      id: 'fund',
      schemeCode: 1,
      name: 'Fund',
      category: 'midcap',
      latestNav: 12,
      transactions: [{ id: 'sip', date: '2026-09-03T00:00:00.000Z', amount: 1000, units: 100, nav: 10, kind: 'sip', importSource: 'etmoney' }],
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
    }];

    const history = assetValueHistory(value, '1W', new Date('2026-09-06T12:00:00.000Z'));

    expect(history.find((point) => point.d === '2026-09-02')?.totalAssets).toBe(0);
    expect(history.find((point) => point.d === '2026-09-03')?.totalAssets).toBe(1000);
    expect(history[history.length - 1].totalAssets).toBe(1200);
  });

  it('includes linked Ledger buys and sells while preserving undated holdings as the base', () => {
    const value = plan();
    value.assets.gold.jewellery = 5000;
    value.assets.gold.others = [
      { id: 'buy-holding', name: 'Coin', value: 1000 },
      { id: 'sell-holding', name: 'Coin sale', value: -200 },
    ];
    value.ledger = [
      { id: 'buy', holdingId: 'buy-holding', date: '2026-09-02T00:00:00.000Z', assetClassKey: 'gold', name: 'Coin', amount: 1000, kind: 'buy', createdAt: '', updatedAt: '' },
      { id: 'sell', holdingId: 'sell-holding', date: '2026-09-04T00:00:00.000Z', assetClassKey: 'gold', name: 'Coin sale', amount: 200, kind: 'sell', createdAt: '', updatedAt: '' },
    ];

    const history = assetValueHistory(value, '1W', new Date('2026-09-06T12:00:00.000Z'));

    expect(history.find((point) => point.d === '2026-09-01')?.totalAssets).toBe(5000);
    expect(history.find((point) => point.d === '2026-09-02')?.totalAssets).toBe(6000);
    expect(history.find((point) => point.d === '2026-09-04')?.totalAssets).toBe(5800);
    expect(history[history.length - 1].totalAssets).toBe(5800);
  });

  it('applies MF redemptions and ignores funds in disabled asset classes', () => {
    const value = plan();
    value.mutualFunds = [{
      id: 'fund',
      schemeCode: 1,
      name: 'Fund',
      category: 'midcap',
      latestNav: 12,
      transactions: [
        { id: 'sell', date: '2026-09-04T00:00:00.000Z', amount: -600, units: -50, nav: 12, kind: 'redeem' },
        { id: 'buy', date: '2026-09-01T00:00:00.000Z', amount: 1000, units: 100, nav: 10, kind: 'sip' },
      ],
      createdAt: '',
      updatedAt: '',
    }];

    const enabled = assetValueHistory(value, '1W', new Date('2026-09-06T12:00:00.000Z'));
    expect(enabled.find((point) => point.d === '2026-09-01')?.totalAssets).toBe(1000);
    expect(enabled.find((point) => point.d === '2026-09-04')?.totalAssets).toBe(600);
    expect(enabled[enabled.length - 1].totalAssets).toBe(600);

    value.disabledClasses = ['equity_mf'];
    const disabled = assetValueHistory(value, '1W', new Date('2026-09-06T12:00:00.000Z'));
    expect(disabled.every((point) => point.totalAssets === 0)).toBe(true);
  });
});
