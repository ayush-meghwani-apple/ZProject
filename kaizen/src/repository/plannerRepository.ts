import { storage } from '../storage';
import { newId, now } from '../core/util';
import type {
  AssetClassAssumption,
  CustomAssetClass,
  FinancialPlan,
  HoldingRow,
  HorizonDef,
  MutualFundHolding,
} from '../types/models';
import { DEFAULT_HORIZONS } from '../types/models';

const PLAN_ID = 'default';
/** Current document version. Bump when the FinancialPlan shape changes and add a
 *  migration step in `migrate()`. Migration only ever ADDS/defaults fields. */
export const PLAN_VERSION = 1;

/** Default asset-mix assumptions, seeded from the source spreadsheet's table.
 *  Weights are keyed by horizon id (short/medium/long). */
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
    mutualFunds: [],
    horizons: DEFAULT_HORIZONS.map((h) => ({ ...h })),
    customClasses: [],
    fixedLabels: {},
    disabledClasses: [],
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

  const horizons = migrateHorizons(raw.horizons);

  return {
    id: PLAN_ID,
    v: PLAN_VERSION,
    assumptions: migrateAssumptions(raw.assumptions, base.assumptions),
    cashFlow: {
      inflows,
      outflows,
      emergencyTarget: Number.isFinite(Number(cf.emergencyTarget)) ? Number(cf.emergencyTarget) : undefined,
    },
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
    goals: migrateGoals(raw.goals, horizons),
    recurringInvestments: Array.isArray(raw.recurringInvestments)
      ? (raw.recurringInvestments as FinancialPlan['recurringInvestments'])
      : [],
    mutualFunds: migrateMutualFunds(raw.mutualFunds),
    horizons: migrateHorizons(raw.horizons),
    customClasses: migrateCustomClasses(raw.customClasses),
    fixedLabels:
      raw.fixedLabels && typeof raw.fixedLabels === 'object'
        ? (raw.fixedLabels as Record<string, string>)
        : {},
    disabledClasses: Array.isArray(raw.disabledClasses)
      ? (raw.disabledClasses as string[])
      : [],
    updatedAt: (raw.updatedAt as string) ?? now(),
  };
}

/** Sanitize/default the tracked mutual-funds list. Non-destructive: keeps valid
 *  funds and their transaction ledgers, drops only unusable entries. */
function migrateMutualFunds(raw: unknown): MutualFundHolding[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const out: MutualFundHolding[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue;
    const code = num(r.schemeCode);
    if (!code) continue;
    const txns = Array.isArray(r.transactions)
      ? (r.transactions as Record<string, unknown>[])
          .filter((t) => t && typeof t === 'object')
          .map((t) => ({
            id: (t.id as string) || newId(),
            date: (t.date as string) || now(),
            amount: num(t.amount),
            units: num(t.units),
            nav: num(t.nav),
            kind: t.kind === 'lumpsum' ? ('lumpsum' as const) : ('sip' as const),
            auto: t.auto === true,
          }))
      : [];
    const sipRaw = r.sip as Record<string, unknown> | undefined;
    const sip =
      sipRaw && typeof sipRaw === 'object' && num(sipRaw.amount) > 0
        ? {
            amount: num(sipRaw.amount),
            dayOfMonth: Math.min(28, Math.max(1, num(sipRaw.dayOfMonth) || 1)),
            startDate: (sipRaw.startDate as string) || now(),
            active: sipRaw.active !== false,
          }
        : undefined;
    out.push({
      id: (r.id as string) || newId(),
      schemeCode: code,
      name: (r.name as string) || 'Fund',
      category: (r.category as MutualFundHolding['category']) || 'other',
      transactions: txns,
      sip,
      latestNav: Number.isFinite(Number(r.latestNav)) ? Number(r.latestNav) : undefined,
      latestNavDate: (r.latestNavDate as string) || undefined,
      createdAt: (r.createdAt as string) || now(),
      updatedAt: (r.updatedAt as string) || now(),
    });
  }
  return out;
}

/** Migrate assumptions from the old fixed shortPct/mediumPct/longPct fields to
 *  the `weights` map keyed by horizon id. Non-destructive: keeps any existing
 *  `weights` and every row. */
function migrateAssumptions(raw: unknown, fallback: AssetClassAssumption[]): AssetClassAssumption[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  return (raw as Record<string, unknown>[]).map((a) => {
    const existing = (a.weights && typeof a.weights === 'object' ? a.weights : null) as Record<string, number> | null;
    const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const weights = existing ?? {
      short: num(a.shortPct),
      medium: num(a.mediumPct),
      long: num(a.longPct),
    };
    return {
      key: String(a.key ?? newId()),
      label: String(a.label ?? ''),
      expectedReturnPct: num(a.expectedReturnPct),
      weights,
    };
  });
}

/** Migrate/seed the goal-type list (formerly "horizons"). When absent, use the
 *  three defaults. Preserves any legacy `maxYears` so existing goals can be
 *  mapped to a type, and carries the optional one-line `description`. */
function migrateHorizons(raw: unknown): HorizonDef[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_HORIZONS.map((h) => ({ ...h }));
  return (raw as Record<string, unknown>[]).map((h) => ({
    id: String(h.id ?? newId()),
    label: String(h.label ?? 'Goal type'),
    description: typeof h.description === 'string' ? h.description : undefined,
    maxYears: Number.isFinite(Number(h.maxYears)) ? Number(h.maxYears) : undefined,
  }));
}

/** Ensure every goal has a `goalTypeId`. Existing goals (which used to be mapped
 *  by years-left) are assigned the type whose legacy `maxYears` they fall under,
 *  preserving their current allocation; otherwise the first type. */
function migrateGoals(raw: unknown, horizons: HorizonDef[]): FinancialPlan['goals'] {
  if (!Array.isArray(raw)) return [];
  const firstId = horizons[0]?.id;
  const withMax = horizons.filter((h) => Number.isFinite(h.maxYears as number));
  const sorted = [...withMax].sort((a, b) => (a.maxYears as number) - (b.maxYears as number));
  return (raw as Record<string, unknown>[]).map((g) => {
    let goalTypeId = typeof g.goalTypeId === 'string' ? g.goalTypeId : undefined;
    if (!goalTypeId || !horizons.some((h) => h.id === goalTypeId)) {
      const years = Number(g.yearsLeft) || 0;
      const match = sorted.find((h) => years < (h.maxYears as number));
      goalTypeId = (match ?? sorted[sorted.length - 1])?.id ?? firstId;
    }
    return { ...(g as unknown as FinancialPlan['goals'][number]), goalTypeId };
  });
}

/** Migrate/seed the custom asset classes list. */
function migrateCustomClasses(raw: unknown): CustomAssetClass[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((c) => ({
    id: String(c.id ?? newId()),
    label: String(c.label ?? ''),
    liquid: c.liquid !== false,
    holdings: cleanRows(c.holdings as HoldingRow[] | undefined),
  }));
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

  /** Import a Fortuna plan JSON (from the xlsx converter or a plan export) and
   *  make it the current plan. Runs the same forward-only migration as load, so
   *  a partial/older document is completed safely. Writes ONLY the plan record —
   *  every other sub-app's data is left untouched. Returns the stored plan. */
  async importPlan(raw: unknown): Promise<FinancialPlan> {
    const plan = migrate(raw as Record<string, unknown> | null);
    const toStore: FinancialPlan = { ...plan, id: PLAN_ID, v: PLAN_VERSION, updatedAt: now() };
    await storage.plannerDocs.put(toStore);
    return toStore;
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
