import { describe, it, expect } from 'vitest';
import { ensureEquityMfSplit } from './plannerRepository';
import type { AssetClassAssumption } from '../types/models';

const de = (weights: Record<string, number>, ret = 12): AssetClassAssumption => ({
  key: 'domestic_equity',
  label: 'Domestic equity',
  expectedReturnPct: ret,
  weights,
});

describe('ensureEquityMfSplit', () => {
  it('splits Domestic equity into Equity Stocks (zeroed) + Equity Mutual Funds (keeps the weight)', () => {
    const { assumptions } = ensureEquityMfSplit([de({ short: 0, medium: 40, long: 60 })], []);
    const stocks = assumptions.find((a) => a.key === 'domestic_equity')!;
    const mf = assumptions.find((a) => a.key === 'equity_mf')!;
    // Total equity allocation is preserved on the MF row; stocks zeroed.
    expect(mf.weights).toEqual({ short: 0, medium: 40, long: 60 });
    expect(stocks.weights).toEqual({ short: 0, medium: 0, long: 0 });
    expect(mf.expectedReturnPct).toBe(12);
    // MF row is inserted right after the stocks row.
    expect(assumptions.indexOf(mf)).toBe(assumptions.indexOf(stocks) + 1);
  });

  it('is idempotent once equity_mf exists', () => {
    const rows: AssetClassAssumption[] = [
      de({ short: 0, medium: 0, long: 0 }),
      { key: 'equity_mf', label: 'Equity mutual funds', expectedReturnPct: 12, weights: { short: 0, medium: 40, long: 60 } },
    ];
    const { assumptions } = ensureEquityMfSplit(rows, []);
    expect(assumptions).toBe(rows); // unchanged reference
  });

  it('mirrors a disabled Domestic equity onto the new mutual-funds class', () => {
    const { disabledClasses } = ensureEquityMfSplit([de({ short: 0, medium: 40, long: 60 })], ['domestic_equity']);
    expect(disabledClasses).toContain('domestic_equity');
    expect(disabledClasses).toContain('equity_mf');
  });

  it('does nothing when there is no domestic_equity row', () => {
    const rows: AssetClassAssumption[] = [{ key: 'debt', label: 'Debt', expectedReturnPct: 6, weights: { short: 100 } }];
    const { assumptions } = ensureEquityMfSplit(rows, []);
    expect(assumptions).toBe(rows);
  });
});
