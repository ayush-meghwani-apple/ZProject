import type { MFCategory, MutualFundHolding } from '../types/models';

export type MfBenchmarkId =
  | 'nifty-500'
  | 'nifty-midcap-150'
  | 'nifty-500-multicap-50-25-25'
  | 'nifty-smallcap-250'
  | 'nifty-50-equal-weight'
  | 'nifty-50';

export interface MfBenchmarkDefinition {
  id: MfBenchmarkId;
  categoryLabel: string;
  indexName: string;
  fileName: string;
}

export interface MfBenchmarkAllocation extends MfBenchmarkDefinition {
  currentValue: number;
  blendWeight: number;
  portfolioWeight: number;
  fundCount: number;
}

export interface MfBenchmarkAllocationSummary {
  allocations: MfBenchmarkAllocation[];
  mappedValue: number;
  totalValue: number;
  coveragePct: number;
}

export const MF_BENCHMARKS: Record<MfBenchmarkId, MfBenchmarkDefinition> = {
  'nifty-500': {
    id: 'nifty-500',
    categoryLabel: 'Flexi Cap',
    indexName: 'Nifty 500 TRI',
    fileName: 'nifty-500-tri.json',
  },
  'nifty-midcap-150': {
    id: 'nifty-midcap-150',
    categoryLabel: 'Mid Cap',
    indexName: 'Nifty Midcap 150 TRI',
    fileName: 'nifty-midcap-150-tri.json',
  },
  'nifty-500-multicap-50-25-25': {
    id: 'nifty-500-multicap-50-25-25',
    categoryLabel: 'Multi Cap',
    indexName: 'Nifty500 Multicap 50:25:25 TRI',
    fileName: 'nifty-500-multicap-50-25-25-tri.json',
  },
  'nifty-smallcap-250': {
    id: 'nifty-smallcap-250',
    categoryLabel: 'Small Cap',
    indexName: 'Nifty Smallcap 250 TRI',
    fileName: 'nifty-smallcap-250-tri.json',
  },
  'nifty-50-equal-weight': {
    id: 'nifty-50-equal-weight',
    categoryLabel: 'Equal Weight Nifty 50',
    indexName: 'Nifty50 Equal Weight TRI',
    fileName: 'nifty-50-equal-weight-tri.json',
  },
  'nifty-50': {
    id: 'nifty-50',
    categoryLabel: 'Nifty 50 Index',
    indexName: 'Nifty 50 TRI',
    fileName: 'nifty-50-tri.json',
  },
};

type FundIdentity = Pick<MutualFundHolding, 'name' | 'category' | 'schemeCategory'>;

function normalized(value: string | undefined): string {
  return (value ?? '').toLocaleLowerCase('en-IN').replace(/[^a-z0-9]+/g, ' ').trim();
}

function benchmarkFromCategory(category: MFCategory): MfBenchmarkDefinition | null {
  if (category === 'flexicap') return MF_BENCHMARKS['nifty-500'];
  if (category === 'midcap') return MF_BENCHMARKS['nifty-midcap-150'];
  if (category === 'smallcap') return MF_BENCHMARKS['nifty-smallcap-250'];
  return null;
}

/** Resolve the designated benchmark without treating generic large-cap funds as index funds. */
export function designatedBenchmarkForFund(fund: FundIdentity): MfBenchmarkDefinition | null {
  const name = normalized(fund.name);
  const officialCategory = normalized(fund.schemeCategory);
  const identity = `${officialCategory} ${name}`;

  if (/\bnifty\s*50\s+equal\s+weight\b/.test(identity)) return MF_BENCHMARKS['nifty-50-equal-weight'];
  if (/\bnifty\s*50\s+index(?:\s+(?:fund|direct|regular|plan|growth|idcw))*\s*$/.test(name)) {
    return MF_BENCHMARKS['nifty-50'];
  }
  if (/\bmulti\s*cap\b/.test(identity)) return MF_BENCHMARKS['nifty-500-multicap-50-25-25'];
  if (/\bflexi\s*cap\b/.test(identity)) return MF_BENCHMARKS['nifty-500'];
  if (/\bmid\s*cap\b|\bmidcap\b/.test(identity)) return MF_BENCHMARKS['nifty-midcap-150'];
  if (/\bsmall\s*cap\b|\bsmallcap\b/.test(identity)) return MF_BENCHMARKS['nifty-smallcap-250'];

  // AMFI's official category is more precise than the legacy user bucket. If
  // it exists but does not match this table, keep the existing peer fallback.
  return officialCategory ? null : benchmarkFromCategory(fund.category);
}

function currentFundValue(fund: MutualFundHolding): number {
  const units = fund.transactions
    .filter((transaction) => !transaction.processing)
    .reduce((sum, transaction) => sum + (Number(transaction.units) || 0), 0);
  return Math.max(0, units * (Number(fund.latestNav) || 0));
}

/** Build fixed benchmark weights from current holding values, not SIP contributions. */
export function getMfBenchmarkAllocation(funds: MutualFundHolding[]): MfBenchmarkAllocationSummary {
  const totalValue = funds.reduce((sum, fund) => sum + currentFundValue(fund), 0);
  const grouped = new Map<MfBenchmarkId, { currentValue: number; fundCount: number }>();
  for (const fund of funds) {
    const benchmark = designatedBenchmarkForFund(fund);
    const currentValue = currentFundValue(fund);
    if (!benchmark || currentValue <= 0) continue;
    const entry = grouped.get(benchmark.id) ?? { currentValue: 0, fundCount: 0 };
    entry.currentValue += currentValue;
    entry.fundCount += 1;
    grouped.set(benchmark.id, entry);
  }
  const mappedValue = [...grouped.values()].reduce((sum, entry) => sum + entry.currentValue, 0);
  const allocations = (Object.keys(MF_BENCHMARKS) as MfBenchmarkId[])
    .filter((id) => grouped.has(id))
    .map((id) => {
      const entry = grouped.get(id)!;
      return {
        ...MF_BENCHMARKS[id],
        currentValue: entry.currentValue,
        blendWeight: mappedValue > 0 ? entry.currentValue / mappedValue : 0,
        portfolioWeight: totalValue > 0 ? entry.currentValue / totalValue : 0,
        fundCount: entry.fundCount,
      };
    });
  return {
    allocations,
    mappedValue,
    totalValue,
    coveragePct: totalValue > 0 ? (mappedValue / totalValue) * 100 : 0,
  };
}