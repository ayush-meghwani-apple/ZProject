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

/** A brand-new, empty plan. All numbers start at 0 so nothing is assumed. */
function defaultPlan(): FinancialPlan {
  return {
    id: PLAN_ID,
    v: PLAN_VERSION,
    assumptions: defaultAssumptions(),
    cashFlow: {
      inflows: { salary: 0, business: 0, rental: 0, others: 0 },
      outflows: { expenses: 0, compulsoryInvestments: 0, loanEmis: 0, insurance: 0, others: 0 },
      customInflows: [],
      customOutflows: [],
    },
    assets: {
      realEstate: { home: 0, otherRealEstate: 0, reits: 0 },
      domesticEquity: { stocks: [], mutualFunds: [] },
      usEquity: { sp500Etf: 0, otherEtfs: 0, mutualFunds: 0 },
      debt: { liquidCash: 0, fds: [], debtFunds: [], epfPpfVpf: [] },
      gold: { jewellery: 0, sgb: 0, goldEtf: 0 },
      crypto: { crypto: 0 },
      misc: { ulips: 0, smallcase: 0 },
    },
    liabilities: { homeLoan: 0, educationLoan: 0, carLoan: 0, personalGoldLoan: 0, creditCard: 0, other: 0, custom: [] },
    goals: [],
    recurringInvestments: [],
    updatedAt: now(),
  };
}

/**
 * Forward-only, non-destructive migration + defaulting. Takes whatever came out
 * of storage (possibly an older/partial document) and returns a complete plan
 * with every field present. NEVER drops fields it doesn't recognise; it only
 * fills in the ones that are missing. This is the safety net that keeps an old
 * plan from breaking after a schema change.
 */
function migrate(raw: Partial<FinancialPlan> | undefined | null): FinancialPlan {
  const base = defaultPlan();
  if (!raw) return base;

  const a = raw.assets ?? {};
  const cf = raw.cashFlow ?? {};
  return {
    id: PLAN_ID,
    v: PLAN_VERSION,
    assumptions:
      Array.isArray(raw.assumptions) && raw.assumptions.length ? raw.assumptions : base.assumptions,
    cashFlow: {
      inflows: { ...base.cashFlow.inflows, ...(cf as FinancialPlan['cashFlow']).inflows },
      outflows: { ...base.cashFlow.outflows, ...(cf as FinancialPlan['cashFlow']).outflows },
      customInflows: cleanRows((cf as FinancialPlan['cashFlow']).customInflows),
      customOutflows: cleanRows((cf as FinancialPlan['cashFlow']).customOutflows),
    },
    assets: {
      realEstate: { ...base.assets.realEstate, ...(a as FinancialPlan['assets']).realEstate },
      domesticEquity: {
        stocks: cleanRows((a as FinancialPlan['assets']).domesticEquity?.stocks),
        mutualFunds: cleanRows((a as FinancialPlan['assets']).domesticEquity?.mutualFunds),
      },
      usEquity: { ...base.assets.usEquity, ...(a as FinancialPlan['assets']).usEquity },
      debt: {
        ...base.assets.debt,
        ...(a as FinancialPlan['assets']).debt,
        fds: cleanRows((a as FinancialPlan['assets']).debt?.fds),
        debtFunds: cleanRows((a as FinancialPlan['assets']).debt?.debtFunds),
        epfPpfVpf: cleanRows((a as FinancialPlan['assets']).debt?.epfPpfVpf),
      },
      gold: { ...base.assets.gold, ...(a as FinancialPlan['assets']).gold },
      crypto: { ...base.assets.crypto, ...(a as FinancialPlan['assets']).crypto },
      misc: { ...base.assets.misc, ...(a as FinancialPlan['assets']).misc },
    },
    liabilities: { ...base.liabilities, ...raw.liabilities, custom: cleanRows(raw.liabilities?.custom) },
    goals: Array.isArray(raw.goals) ? raw.goals : [],
    recurringInvestments: Array.isArray(raw.recurringInvestments) ? raw.recurringInvestments : [],
    updatedAt: raw.updatedAt ?? now(),
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
    const raw = (await storage.plannerDocs.get(PLAN_ID)) as FinancialPlan | undefined;
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
    const raw = (await storage.plannerDocs.get(PLAN_ID)) as FinancialPlan | undefined;
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
