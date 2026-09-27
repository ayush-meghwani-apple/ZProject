import { describe, expect, it } from 'vitest';
import { benchmarkCategoryForFund, designatedBenchmarkForFund, getMfBenchmarkAllocation } from './mfCategoryBenchmark';
import type { MFCategory, MutualFundHolding } from '../types/models';

function fund(name: string, category: MFCategory, schemeCategory?: string): MutualFundHolding {
  return {
    id: name,
    schemeCode: 1,
    name,
    category,
    schemeCategory,
    transactions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('designatedBenchmarkForFund', () => {
  it.each([
    ['Parag Parikh Flexi Cap Fund', 'flexicap', 'Equity Scheme - Flexi Cap Fund', 'nifty-500'],
    ['PGIM India Midcap Fund', 'midcap', 'Equity Scheme - Mid Cap Fund', 'nifty-midcap-150'],
    ['Quant Multi Cap Fund', 'flexicap', 'Equity Scheme - Multi Cap Fund', 'nifty-500-multicap-50-25-25'],
    ['Nippon India Small Cap Fund', 'smallcap', 'Equity Scheme - Small Cap Fund', 'nifty-smallcap-250'],
    ['DSP Nifty 50 Equal Weight Index Fund', 'largecap', 'Other Scheme - Index Funds', 'nifty-50-equal-weight'],
    ['Navi Nifty 50 Index Fund', 'largecap', 'Other Scheme - Index Funds', 'nifty-50'],
    ['ICICI Prudential Nifty 50 Index', 'largecap', 'Other Scheme - Index Funds', 'nifty-50'],
  ] as const)('maps %s to its designated TRI', (name, category, schemeCategory, expected) => {
    expect(designatedBenchmarkForFund(fund(name, category, schemeCategory))?.id).toBe(expected);
  });

  it('uses Nifty 50 TRI for a standard active large-cap fund', () => {
    expect(designatedBenchmarkForFund(fund('Example Large Cap Fund', 'largecap', 'Equity Scheme - Large Cap Fund'))?.id).toBe('nifty-50');
  });

  it('does not classify a Nifty 50 factor index as the standard Nifty 50 index', () => {
    expect(designatedBenchmarkForFund(fund('Example Nifty 50 Value 20 Index Fund', 'largecap', 'Other Scheme - Index Funds'))).toBeNull();
  });

  it('does not let a legacy user bucket override an unrelated official category', () => {
    expect(designatedBenchmarkForFund(fund('Franklin US Opportunities Fund', 'midcap', 'Other Scheme - FoF Overseas'))).toBeNull();
  });
});

describe('benchmarkCategoryForFund', () => {
  it('keeps Flexi and Multi Cap in separate benchmark categories', () => {
    const flexi = benchmarkCategoryForFund(fund('Parag Parikh Flexi Cap Fund', 'flexicap', 'Equity Scheme - Flexi Cap Fund'));
    const multi = benchmarkCategoryForFund(fund('Quant Multi Cap Fund', 'flexicap', 'Equity Scheme - Multi Cap Fund'));

    expect([flexi?.id, flexi?.benchmark.id]).toEqual(['flexicap', 'nifty-500']);
    expect([multi?.id, multi?.benchmark.id]).toEqual(['multicap', 'nifty-500-multicap-50-25-25']);
  });

  it('groups standard and equal-weight funds into the Nifty 50 large-cap segment', () => {
    const standard = benchmarkCategoryForFund(fund('Example Large Cap Fund', 'largecap', 'Equity Scheme - Large Cap Fund'));
    const equalWeight = benchmarkCategoryForFund(fund('DSP Nifty 50 Equal Weight Index Fund', 'largecap', 'Other Scheme - Index Funds'));

    expect([standard?.id, standard?.benchmark.id]).toEqual(['largecap', 'nifty-50']);
    expect([equalWeight?.id, equalWeight?.benchmark.id]).toEqual(['largecap', 'nifty-50']);
  });
});

describe('getMfBenchmarkAllocation', () => {
  it('weights designated indices by current fund value and reports unmapped coverage', () => {
    const flexi = fund('Parag Parikh Flexi Cap Fund', 'flexicap', 'Equity Scheme - Flexi Cap Fund');
    const mid = fund('Example Mid Cap Fund', 'midcap', 'Equity Scheme - Mid Cap Fund');
    const small = fund('Example Small Cap Fund', 'smallcap', 'Equity Scheme - Small Cap Fund');
    const unmapped = fund('Overseas Fund', 'other', 'Other Scheme - FoF Overseas');
    for (const [holding, value] of [[flexi, 4_000_000], [mid, 3_000_000], [small, 3_000_000], [unmapped, 1_000_000]] as const) {
      holding.latestNav = 10;
      holding.transactions = [{
        id: `${holding.id}-buy`,
        date: '2026-01-01T00:00:00.000Z',
        amount: value,
        units: value / 10,
        nav: 10,
        kind: 'lumpsum',
      }];
    }

    const result = getMfBenchmarkAllocation([flexi, mid, small, unmapped]);
    expect(result.coveragePct).toBeCloseTo(90.909);
    expect(result.allocations.map(({ id, blendWeight, portfolioWeight }) => ({
      id,
      blendWeight,
      portfolioWeight,
    }))).toEqual([
      { id: 'nifty-500', blendWeight: 0.4, portfolioWeight: 4 / 11 },
      { id: 'nifty-midcap-150', blendWeight: 0.3, portfolioWeight: 3 / 11 },
      { id: 'nifty-smallcap-250', blendWeight: 0.3, portfolioWeight: 3 / 11 },
    ]);
  });
});