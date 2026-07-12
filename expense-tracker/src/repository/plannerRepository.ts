import { storage } from '../storage';
import { newId, now } from '../core/util';
import type {
  AssetClassAssumption,
  FinancialPlan,
  HoldingRow,
} from '../types/models';

const PLAN_ID = 'default';
/** Current document version. Bump when the FinancialPlan shape changes and add a
 *  migration step in `migrate()`. Migration only ever ADDS/defaults fields. */
export const PLAN_VERSION = 1;

/** Default asset-mix assumptions, seeded from the source spreadsheet's table. */
function defaultAssumptions(): AssetClassAssumption[] {
  return [
    { key: 'domestic_equity', label: 'Domestic equity', expectedReturnPct: 12, shortPct: 0, mediumPct: 40, longPct: 60 },
    { key: 'us_equity', label: 'US equity', expectedReturnPct: 12, shortPct: 0, mediumPct: 0, longPct: 10 },
    { key: 'debt', label: 'Debt', expectedReturnPct: 6, shortPct: 100, mediumPct: 50, longPct: 15 },
    { key: 'gold', label: 'Gold (SGB / ETF)', expectedReturnPct: 6, shortPct: 0, mediumPct: 10, longPct: 5 },
    { key: 'crypto', label: 'Crypto', expectedReturnPct: 20, shortPct: 0, mediumPct: 0, longPct: 5 },
    { key: 'real_estate', label: 'Real Estate / REITs', expectedReturnPct: 10, shortPct: 0, mediumPct: 0, longPct: 5 },
  ];
}

const row = (name: string, value: unknown): HoldingRow => ({
  id: newId(),
  name,
  value: Number(value) || 0,
});

function defaultInflows(): HoldingRow[] {
  return [row('Post-tax salary', 0), row('Business income', 0), row('Rental income', 0), row('Others', 0)];
}
function defaultOutflows(): HoldingRow[] {
  return [
    row('Monthly expenses', 0),
    row('Compulsory investments', 0),
    row('Loan EMIs', 0),
    row('Insurance premiums', 0),
    row('Others', 0),
  ];
}
function defaultLiabilities(): HoldingRow[] {
  return [
    row('Home loan', 0),
    row('Education loan', 0),
    row('Car loan', 0),
    row('Personal / Gold loan', 0),
    row('Credit card', 0),
    row('Other liabilities', 0),
  ];
}

/** A brand-new, empty plan. All numbers start at 0 so nothing is assumed. */
function defaultPlan(): FinancialPlan {
  return {
    id: PLAN_ID,
    v: PLAN_VERSION,
    assumptions: defaultAssumptions(),
    cashFlow: {
      inflows: defaultInflows(),
      outflows: defaultOutflows(),
    },
    assets: {
      realEstate: { home: 0, otherRealEstate: 0, reits: 0, others: [] },
      domesticEquity: { stocks: [], mutualFunds: [] },
      usEquity: { sp500Etf: 0, otherEtfs: 0, mutualFunds: 0, others: [] },
      debt: { liquidCash: 0, fds: [], debtFunds: [], epfPpfVpf: [] },
      gold: { jewellery: 0, sgb: 0, goldEtf: 0, others: [] },
      crypto: { crypto: 0, others: [] },
      misc: { ulips: 0, smallcase: 0 },
    },
    liabilities: { items: defaultLiabilities() },
    goals: [],
    recurringInvestments: [],
    updatedAt: now(),
  };
}

/**
 * Build a cash-flow / liability list from whatever's stored: if it's already a
 * list, keep it; if it's the OLD fixed-object shape, convert it into named rows
 * (preserving values) and append any old `custom*` rows. Non-destructive.
 */
function toList(
  current: unknown,
  legacyFields: [string, string][],
  legacyObj: Record<string, unknown> | undefined,
  legacyExtra: unknown,
): HoldingRow[] {
  if (Array.isArray(current)) return cleanRows(current as HoldingRow[]);
  const o = legacyObj ?? {};
  const seeded = legacyFields.map(([key, name]) => row(name, o[key]));
  return [...seeded, ...cleanRows(legacyExtra as HoldingRow[] | undefined)];
}

/**
 * Forward-only, non-destructive migration + defaulting. Takes whatever came out
 * of storage (possibly an older/partial document) and returns a complete plan
 * with every field present. NEVER drops data; it fills in what's missing and
 * upgrades old shapes (fixed cash-flow/liability objects → editable lists).
 */
function migrate(raw: Record<string, unknown> | undefined | null): FinancialPlan {
  const base = defaultPlan();
  if (!raw) return base;

  const a = (raw.assets ?? {}) as Record<string, Record<string, unknown>>;
  const cf = (raw.cashFlow ?? {}) as Record<string, unknown>;
  const liab = (raw.liabilities ?? {}) as Record<string, unknown>;

  const inflows = toList(
    cf.inflows,
    [['salary', 'Post-tax salary'], ['business', 'Business income'], ['rental', 'Rental income'], ['others', 'Others']],
    cf.inflows as Record<string, unknown> | undefined,
    cf.customInflows,
  );
  const outflows = toList(
    cf.outflows,
    [
      ['expenses', 'Monthly expenses'],
      ['compulsoryInvestments', 'Compulsory investments'],
      ['loanEmis', 'Loan EMIs'],
      ['insurance', 'Insurance premiums'],
      ['others', 'Others'],
    ],
    cf.outflows as Record<string, unknown> | undefined,
    cf.customOutflows,
  );
  const liabilityItems = toList(
    liab.items,
    [
      ['homeLoan', 'Home loan'],
      ['educationLoan', 'Education loan'],
      ['carLoan', 'Car loan'],
      ['personalGoldLoan', 'Personal / Gold loan'],
      ['creditCard', 'Credit card'],
      ['other', 'Other liabilities'],
    ],
    liab,
    liab.custom,
  );

  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const re = (a.realEstate ?? {}) as Record<string, unknown>;
  const us = (a.usEquity ?? {}) as Record<string, unknown>;
  const de = (a.domesticEquity ?? {}) as Record<string, unknown>;
  const debt = (a.debt ?? {}) as Record<string, unknown>;
  const gold = (a.gold ?? {}) as Record<string, unknown>;
  const crypto = (a.crypto ?? {}) as Record<string, unknown>;
  const misc = (a.misc ?? {}) as Record<string, unknown>;

  return {
    id: PLAN_ID,
    v: PLAN_VERSION,
    assumptions:
      Array.isArray(raw.assumptions) && raw.assumptions.length
        ? (raw.assumptions as AssetClassAssumption[])
        : base.assumptions,
    cashFlow: { inflows, outflows },
    assets: {
      realEstate: {
        home: num(re.home),
        otherRealEstate: num(re.otherRealEstate),
        reits: num(re.reits),
        others: cleanRows(re.others as HoldingRow[] | undefined),
      },
      domesticEquity: {
        stocks: cleanRows(de.stocks as HoldingRow[] | undefined),
        mutualFunds: cleanRows(de.mutualFunds as HoldingRow[] | undefined),
      },
      usEquity: {
        sp500Etf: num(us.sp500Etf),
        otherEtfs: num(us.otherEtfs),
        mutualFunds: num(us.mutualFunds),
        others: cleanRows(us.others as HoldingRow[] | undefined),
      },
      debt: {
        liquidCash: num(debt.liquidCash),
        fds: cleanRows(debt.fds as HoldingRow[] | undefined),
        debtFunds: cleanRows(debt.debtFunds as HoldingRow[] | undefined),
        epfPpfVpf: cleanRows(debt.epfPpfVpf as HoldingRow[] | undefined),
      },
      gold: {
        jewellery: num(gold.jewellery),
        sgb: num(gold.sgb),
        goldEtf: num(gold.goldEtf),
        others: cleanRows(gold.others as HoldingRow[] | undefined),
      },
      crypto: { crypto: num(crypto.crypto), others: cleanRows(crypto.others as HoldingRow[] | undefined) },
      misc: { ulips: num(misc.ulips), smallcase: num(misc.smallcase) },
    },
    liabilities: { items: liabilityItems },
    goals: Array.isArray(raw.goals) ? (raw.goals as FinancialPlan['goals']) : [],
    recurringInvestments: Array.isArray(raw.recurringInvestments)
      ? (raw.recurringInvestments as FinancialPlan['recurringInvestments'])
      : [],
    updatedAt: (raw.updatedAt as string) ?? now(),
  };
}

function cleanRows(rows: HoldingRow[] | undefined): HoldingRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({ id: r.id ?? newId(), name: r.name ?? '', category: r.category, value: Number(r.value) || 0 }));
}

export const PlannerRepository = {
  /** Load the plan, seeding+persisting a default if none exists. Always returns
   *  a complete, migrated document. */
  async load(): Promise<FinancialPlan> {
    const raw = (await storage.plannerDocs.get(PLAN_ID)) as Record<string, unknown> | undefined;
    if (!raw) {
      const seed = defaultPlan();
      await storage.plannerDocs.put(seed);
      return seed;
    }
    return migrate(raw);
  },

  /** Persist the plan atomically (single record write). */
  async save(plan: FinancialPlan): Promise<void> {
    const toStore: FinancialPlan = { ...plan, id: PLAN_ID, v: PLAN_VERSION, updatedAt: now() };
    await storage.plannerDocs.put(toStore);
  },

  /** Reset the plan back to an empty default (used by a deliberate reset only). */
  async reset(): Promise<FinancialPlan> {
    const seed = defaultPlan();
    await storage.plannerDocs.put(seed);
    return seed;
  },

  /** Whether a non-empty plan exists (for backup nudges / first-run). */
  async hasData(): Promise<boolean> {
    const raw = (await storage.plannerDocs.get(PLAN_ID)) as Record<string, unknown> | undefined;
    if (!raw) return false;
    const p = migrate(raw);
    const anyAsset =
      p.assets.realEstate.home + p.assets.realEstate.otherRealEstate + p.assets.realEstate.reits +
      p.assets.domesticEquity.stocks.length + p.assets.domesticEquity.mutualFunds.length +
      p.assets.debt.liquidCash + p.assets.gold.jewellery + p.assets.crypto.crypto;
    return p.goals.length > 0 || anyAsset > 0;
  },
};

export { defaultPlan };
