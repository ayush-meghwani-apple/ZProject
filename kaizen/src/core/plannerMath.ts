import type {
  AssetClassAssumption,
  AssetClassKey,
  CashFlow,
  CustomAssetClass,
  FinancialGoalRow,
  FinancialPlan,
  HoldingRow,
  HorizonDef,
  Liabilities,
  MutualFundHolding,
  PlanAssets,
} from '../types/models';
import { DEFAULT_HORIZONS } from '../types/models';

/**
 * Fortuna financial math — pure functions, no side effects.
 *
 * Mirrors the formulas from the source spreadsheet. Everything here is
 * independently testable and never touches storage or the DOM. Percentages come
 * in as whole numbers (12 = 12%) and are converted to fractions internally.
 */

/** A horizon is identified by its id ('short' | 'medium' | 'long' | custom). */
export type Horizon = string;

const pct = (n: number): number => (Number.isFinite(n) ? n / 100 : 0);
const num = (n: number): number => (Number.isFinite(n) ? n : 0);
const sumRows = (rows: HoldingRow[]): number => rows.reduce((s, r) => s + num(r.value), 0);

/** The plan's horizons, or the three defaults if none are set. */
export function planHorizons(horizons?: HorizonDef[]): HorizonDef[] {
  return horizons && horizons.length ? horizons : DEFAULT_HORIZONS;
}

// --- Cash flow -------------------------------------------------------------

export interface CashFlowResult {
  totalInflows: number;
  totalOutflows: number;
  investingSurplus: number;
  recommendedEmergencyFund: number;
}

export function computeCashFlow(cf: CashFlow): CashFlowResult {
  const totalInflows = sumRows(cf.inflows);
  const totalOutflows = sumRows(cf.outflows);
  return {
    totalInflows,
    totalOutflows,
    investingSurplus: totalInflows - totalOutflows,
    recommendedEmergencyFund: totalOutflows * 6,
  };
}

// --- Returns & asset mix ---------------------------------------------------

function weightFor(a: AssetClassAssumption, h: Horizon): number {
  return pct(num(a.weights?.[h] ?? 0));
}

/** Σ(expectedReturn · allocationWeight) for a horizon. */
function sumProductReturns(assumptions: AssetClassAssumption[], h: Horizon): number {
  return assumptions.reduce((s, a) => s + pct(a.expectedReturnPct) * weightFor(a, h), 0);
}

/** Effective (blended) annual return per goal-type id — the allocation-weighted
 *  average of the asset classes' expected returns for that type. */
export function effectiveReturns(
  assumptions: AssetClassAssumption[],
  horizons?: HorizonDef[],
): Record<string, number> {
  const hs = planHorizons(horizons);
  const out: Record<string, number> = {};
  for (const h of hs) out[h.id] = sumProductReturns(assumptions, h.id);
  return out;
}

// --- Goals -----------------------------------------------------------------

/** Legacy helper: map years-left to the goal type whose `maxYears` it falls
 *  under (only used when migrating pre-goal-type plans). */
export function horizonFor(yearsLeft: number, horizons?: HorizonDef[]): Horizon {
  const hs = [...planHorizons(horizons)]
    .filter((h) => Number.isFinite(h.maxYears as number))
    .sort((a, b) => (a.maxYears as number) - (b.maxYears as number));
  if (hs.length === 0) return planHorizons(horizons)[0]?.id ?? '';
  const match = hs.find((h) => yearsLeft < (h.maxYears as number));
  return (match ?? hs[hs.length - 1]).id;
}

/** The goal type a goal is assigned to (its id), falling back to the first. */
export function goalTypeIdOf(goal: FinancialGoalRow, horizons?: HorizonDef[]): string {
  const hs = planHorizons(horizons);
  if (goal.goalTypeId && hs.some((h) => h.id === goal.goalTypeId)) return goal.goalTypeId;
  return hs[0]?.id ?? '';
}

export function horizonLabel(h: Horizon, horizons?: HorizonDef[]): string {
  const def = planHorizons(horizons).find((x) => x.id === h);
  return def ? def.label : 'Goal type';
}

export interface GoalComputed {
  horizon: Horizon;
  effReturn: number; // effective annual return used
  amountRequiredFuture: number; // shortfall to fund via SIP
  sipRequired: number; // level (or stepped) monthly SIP
  allocations: Record<string, number>; // monthly amount per asset class key
}

/**
 * Future shortfall (sheet F-column): grow the required amount by inflation and
 * subtract the current pot grown at the horizon's effective return.
 *   FV = required·(1+infl)^n − available·(1+eff)^n
 */
export function amountRequiredFuture(goal: FinancialGoalRow, effReturn: number): number {
  const n = num(goal.yearsLeft);
  const req = num(goal.amountRequiredToday);
  const avail = num(goal.amountAvailableToday);
  if (req === avail) return 0;
  const fv = req * Math.pow(1 + pct(goal.inflationPct), n) - avail * Math.pow(1 + effReturn, n);
  return Math.max(0, fv);
}

/**
 * Monthly SIP needed to accumulate `fv` over `years` at annual return `eff`.
 * With an annual step-up `g`, contributions rise once a year; we solve the
 * growing-annuity accumulation so the stepped payments still reach `fv`.
 */
export function sipRequired(fv: number, years: number, eff: number, stepUpPct: number): number {
  if (fv <= 0 || years <= 0) return 0;
  const N = Math.round(years * 12);
  if (N <= 0) return 0;
  const m = Math.pow(1 + eff, 1 / 12) - 1; // monthly effective rate
  const g = pct(stepUpPct);

  if (g <= 0) {
    // Level SIP: FV = SIP · [((1+m)^N − 1) / m]  (annuity-due not assumed; end-of-month)
    if (m === 0) return fv / N;
    const factor = (Math.pow(1 + m, N) - 1) / m;
    return fv / factor;
  }

  // Stepped SIP: the base amount X grows by g at each 12-month boundary. Compute
  // the accumulation factor for a base of 1, then X = fv / factor.
  let factor = 0;
  for (let k = 0; k < N; k++) {
    const yearIndex = Math.floor(k / 12);
    const stepFactor = Math.pow(1 + g, yearIndex);
    const monthsRemaining = N - k - 1;
    factor += stepFactor * Math.pow(1 + m, monthsRemaining);
  }
  return factor > 0 ? fv / factor : 0;
}

export function computeGoal(
  goal: FinancialGoalRow,
  assumptions: AssetClassAssumption[],
  horizons?: HorizonDef[],
): GoalComputed {
  const eff = effectiveReturns(assumptions, horizons);
  const horizon = goalTypeIdOf(goal, horizons);
  const effReturn = eff[horizon] ?? 0;
  const fv = amountRequiredFuture(goal, effReturn);
  const sip = sipRequired(fv, num(goal.yearsLeft), effReturn, num(goal.stepUpPct));

  const allocations: Record<string, number> = {};
  for (const a of assumptions) {
    allocations[a.key] = weightFor(a, horizon) * sip;
  }
  return { horizon, effReturn, amountRequiredFuture: fv, sipRequired: sip, allocations };
}

/** Sum every goal's per-asset SIP allocation → target monthly investment mix. */
export function targetAllocation(
  goals: FinancialGoalRow[],
  assumptions: AssetClassAssumption[],
  horizons?: HorizonDef[],
): Record<string, number> {
  const total: Record<string, number> = {};
  for (const a of assumptions) total[a.key] = 0;
  for (const g of goals) {
    const c = computeGoal(g, assumptions, horizons);
    for (const a of assumptions) total[a.key] += c.allocations[a.key] ?? 0;
  }
  return total;
}

// --- Net worth -------------------------------------------------------------

export interface AssetClassValue {
  key: string;
  label: string;
  value: number;
}

export interface NetWorthResult {
  illiquid: number;
  liquid: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  /** Current value grouped by the six asset classes (for the mix pie). */
  byClass: AssetClassValue[];
}

const CLASS_LABELS: Record<AssetClassKey, string> = {
  domestic_equity: 'Domestic Equity',
  us_equity: 'US Equity',
  debt: 'Debt',
  gold: 'Gold',
  crypto: 'Crypto',
  real_estate: 'Real Estate / REITs',
};

export function totalLiabilities(l: Liabilities): number {
  return sumRows(l.items);
}

/** The auto-valued contribution of the Funds-tab holdings, split into the asset
 *  classes they belong to (all AMFI funds are Indian: equity caps → domestic
 *  equity, debt-category funds → debt). Fed into net worth / mix / portfolio so
 *  those auto-update as NAVs refresh. */
export interface TrackedFundTotals {
  domestic_equity?: number;
  debt?: number;
}

/** Sum the Funds-tab holdings' current value (Σ units × latest NAV) by class. */
export function trackedFundsByClass(funds: MutualFundHolding[] = []): TrackedFundTotals {
  let domestic_equity = 0;
  let debt = 0;
  for (const f of funds) {
    const units = (f.transactions ?? []).reduce((s, t) => s + num(t.units), 0);
    const value = units * num(f.latestNav ?? 0);
    if (f.category === 'debt') debt += value;
    else domestic_equity += value;
  }
  return { domestic_equity, debt };
}

export function computeNetWorth(
  assets: PlanAssets,
  liabilities: Liabilities,
  disabled: string[] = [],
  customClasses: CustomAssetClass[] = [],
  tracked: TrackedFundTotals = {},
): NetWorthResult {
  const re = assets.realEstate;
  const de = assets.domesticEquity;
  const us = assets.usEquity;
  const debt = assets.debt;
  const gold = assets.gold;
  const off = new Set(disabled);

  const domesticStocksMF = sumRows(de.stocks) + sumRows(de.mutualFunds);

  // Each class split into its liquid and illiquid parts (mirrors the sheet's
  // C21/C33 split): ULIPs illiquid + Smallcase liquid both class as domestic
  // equity; EPF illiquid within debt; jewellery/SGB illiquid within gold; home /
  // other real estate (and custom "others") illiquid within real estate.
  // `tracked` adds the auto-valued Funds-tab holdings (units × live NAV) into
  // their asset class, so net worth auto-updates as NAVs refresh.
  const parts: Record<AssetClassKey, { liquid: number; illiquid: number }> = {
    domestic_equity: { liquid: domesticStocksMF + num(assets.misc.smallcase) + num(tracked.domestic_equity ?? 0), illiquid: num(assets.misc.ulips) },
    us_equity: { liquid: num(us.sp500Etf) + num(us.otherEtfs) + num(us.mutualFunds) + sumRows(us.others), illiquid: 0 },
    debt: { liquid: num(debt.liquidCash) + sumRows(debt.fds) + sumRows(debt.debtFunds) + num(tracked.debt ?? 0), illiquid: sumRows(debt.epfPpfVpf) },
    gold: { liquid: num(gold.goldEtf) + sumRows(gold.others), illiquid: num(gold.jewellery) + num(gold.sgb) },
    crypto: { liquid: num(assets.crypto.crypto) + sumRows(assets.crypto.others), illiquid: 0 },
    real_estate: { liquid: num(re.reits), illiquid: num(re.home) + num(re.otherRealEstate) + sumRows(re.others) },
  };

  let illiquid = 0;
  let liquid = 0;
  const byClass: AssetClassValue[] = [];
  for (const key of CLASS_ORDER) {
    if (off.has(key)) continue; // disabled classes count nowhere
    const p = parts[key];
    illiquid += p.illiquid;
    liquid += p.liquid;
    byClass.push({ key, label: CLASS_LABELS[key], value: p.liquid + p.illiquid });
  }

  // Custom user-defined classes: each rolls up its holdings, counted as liquid
  // or illiquid per its `liquid` flag, and shown as its own mix slice.
  for (const c of customClasses) {
    if (off.has(c.id)) continue;
    const value = sumRows(c.holdings);
    if (c.liquid) liquid += value;
    else illiquid += value;
    byClass.push({ key: c.id, label: c.label || 'Custom', value });
  }

  const totalAssets = illiquid + liquid;
  const liab = totalLiabilities(liabilities);

  return {
    illiquid,
    liquid,
    totalAssets,
    totalLiabilities: liab,
    netWorth: totalAssets - liab,
    byClass,
  };
}

const CLASS_ORDER: AssetClassKey[] = ['domestic_equity', 'us_equity', 'debt', 'gold', 'crypto', 'real_estate'];

/** Per-asset-class value totals used by both Net Worth and Portfolio views. */
export function assetClassTotals(
  assets: PlanAssets,
  disabled: string[] = [],
  customClasses: CustomAssetClass[] = [],
): Record<string, number> {
  return computeNetWorth(assets, { items: [] }, disabled, customClasses).byClass.reduce(
    (acc, c) => {
      acc[c.key] = c.value;
      return acc;
    },
    {} as Record<string, number>,
  );
}

/** The assumptions rows for classes that are currently enabled. */
export function activeAssumptions(assumptions: AssetClassAssumption[], disabled: string[] = []): AssetClassAssumption[] {
  const off = new Set(disabled);
  return assumptions.filter((a) => !off.has(a.key));
}

export const CLASS_LABEL = CLASS_LABELS;

/** A label lookup for every asset-class key in play — the six built-ins plus any
 *  custom classes (read from their assumption rows). Used to label goal
 *  allocations and the asset-mix legend generically. */
export function classLabelMap(assumptions: AssetClassAssumption[]): Record<string, string> {
  const map: Record<string, string> = { ...CLASS_LABELS };
  for (const a of assumptions) map[a.key] = a.label || map[a.key] || 'Custom';
  return map;
}

/**
 * Per-SECTION totals for the Portfolio tab — grouped the way the data-entry
 * sections are laid out (Smallcase sits under the US Equity section, ULIPs under
 * the Debt section), NOT by asset class. Keep this distinct from the asset-mix
 * buckets so each Portfolio card's chip shows exactly what's entered in it.
 */
export interface SectionTotals {
  realEstate: number;
  domesticEquity: number;
  usEquity: number;
  debt: number;
  gold: number;
  crypto: number;
  total: number;
}

export function sectionTotals(assets: PlanAssets): SectionTotals {
  const realEstate =
    num(assets.realEstate.home) + num(assets.realEstate.otherRealEstate) + num(assets.realEstate.reits) + sumRows(assets.realEstate.others);
  const domesticEquity = sumRows(assets.domesticEquity.stocks) + sumRows(assets.domesticEquity.mutualFunds);
  const usEquity =
    num(assets.usEquity.sp500Etf) + num(assets.usEquity.otherEtfs) + num(assets.usEquity.mutualFunds) + sumRows(assets.usEquity.others) + num(assets.misc.smallcase);
  const debt =
    num(assets.debt.liquidCash) +
    sumRows(assets.debt.fds) +
    sumRows(assets.debt.debtFunds) +
    sumRows(assets.debt.epfPpfVpf) +
    num(assets.misc.ulips);
  const gold = num(assets.gold.jewellery) + num(assets.gold.sgb) + num(assets.gold.goldEtf) + sumRows(assets.gold.others);
  const crypto = num(assets.crypto.crypto) + sumRows(assets.crypto.others);
  return {
    realEstate,
    domesticEquity,
    usEquity,
    debt,
    gold,
    crypto,
    total: realEstate + domesticEquity + usEquity + debt + gold + crypto,
  };
}

export type EquityCap = 'Largecap' | 'Midcap' | 'Smallcap' | 'Flexi/Multi cap';
export const EQUITY_CAPS: EquityCap[] = ['Largecap', 'Midcap', 'Smallcap', 'Flexi/Multi cap'];

/** Domestic-equity value split by market-cap category (stocks + mutual funds),
 *  mirroring the sheet's cap-size aggregation. Uncategorised rows fall under the
 *  first bucket the row's `category` matches, else are ignored from the split. */
export function capBreakdown(assets: PlanAssets): { cap: EquityCap; value: number }[] {
  const rows = [...assets.domesticEquity.stocks, ...assets.domesticEquity.mutualFunds];
  const totals: Record<string, number> = {};
  for (const cap of EQUITY_CAPS) totals[cap] = 0;
  for (const r of rows) {
    const cap = normaliseCap(r.category);
    if (cap) totals[cap] += num(r.value);
  }
  return EQUITY_CAPS.map((cap) => ({ cap, value: totals[cap] }));
}

function normaliseCap(c: string | undefined): EquityCap | null {
  if (!c) return null;
  const s = c.toLowerCase().replace(/\s/g, '');
  if (s.startsWith('large')) return 'Largecap';
  if (s.startsWith('mid')) return 'Midcap';
  if (s.startsWith('small')) return 'Smallcap';
  if (s.startsWith('flexi') || s.startsWith('multi')) return 'Flexi/Multi cap';
  return null;
}

/** Age-based recommended domestic-equity cap allocation (the sheet's O21:S25
 *  reference table). Values are whole-number %. */
export const AGE_EQUITY_ALLOCATION: {
  cap: EquityCap;
  byAge: { '20-30': number; '30-45': number; '45-65': number; '>65': number };
}[] = [
  { cap: 'Largecap', byAge: { '20-30': 20, '30-45': 30, '45-65': 40, '>65': 60 } },
  { cap: 'Midcap', byAge: { '20-30': 30, '30-45': 20, '45-65': 20, '>65': 20 } },
  { cap: 'Smallcap', byAge: { '20-30': 20, '30-45': 20, '45-65': 10, '>65': 0 } },
  { cap: 'Flexi/Multi cap', byAge: { '20-30': 30, '30-45': 30, '45-65': 30, '>65': 20 } },
];

/** Convenience: everything the Net Worth dashboard needs in one call. */
export function computePlanSummary(plan: FinancialPlan) {
  const tracked = trackedFundsByClass(plan.mutualFunds);
  return {
    cashFlow: computeCashFlow(plan.cashFlow),
    netWorth: computeNetWorth(plan.assets, plan.liabilities, plan.disabledClasses ?? [], plan.customClasses ?? [], tracked),
    effReturns: effectiveReturns(plan.assumptions, plan.horizons),
    target: targetAllocation(plan.goals, plan.assumptions, plan.horizons),
  };
}
