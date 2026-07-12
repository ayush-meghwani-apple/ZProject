import type {
  AssetClassAssumption,
  AssetClassKey,
  CashFlow,
  FinancialGoalRow,
  FinancialPlan,
  HoldingRow,
  Liabilities,
  PlanAssets,
} from '../types/models';

/**
 * Fortuna financial math — pure functions, no side effects.
 *
 * Mirrors the formulas from the source spreadsheet. Everything here is
 * independently testable and never touches storage or the DOM. Percentages come
 * in as whole numbers (12 = 12%) and are converted to fractions internally.
 */

export type Horizon = 'short' | 'medium' | 'long';

const pct = (n: number): number => (Number.isFinite(n) ? n / 100 : 0);
const num = (n: number): number => (Number.isFinite(n) ? n : 0);
const sumRows = (rows: HoldingRow[]): number => rows.reduce((s, r) => s + num(r.value), 0);

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
  return pct(h === 'short' ? a.shortPct : h === 'medium' ? a.mediumPct : a.longPct);
}

/** Σ(expectedReturn · allocationWeight) for a horizon. */
function sumProductReturns(assumptions: AssetClassAssumption[], h: Horizon): number {
  return assumptions.reduce((s, a) => s + pct(a.expectedReturnPct) * weightFor(a, h), 0);
}

export interface EffectiveReturns {
  short: number;
  medium: number;
  long: number;
}

/** Effective (blended) annual return per horizon, faithful to the sheet's
 *  blended medium row: medium = SUMPRODUCT(mediumWeights)·0.4 + short·0.6. */
export function effectiveReturns(assumptions: AssetClassAssumption[]): EffectiveReturns {
  const short = sumProductReturns(assumptions, 'short');
  const medium = sumProductReturns(assumptions, 'medium') * 0.4 + short * 0.6;
  const long = sumProductReturns(assumptions, 'long');
  return { short, medium, long };
}

// --- Goals -----------------------------------------------------------------

export function horizonFor(yearsLeft: number): Horizon {
  if (yearsLeft < 3) return 'short';
  if (yearsLeft <= 6) return 'medium';
  return 'long';
}

export function horizonLabel(h: Horizon): string {
  return h === 'short' ? 'Short Term' : h === 'medium' ? 'Medium Term' : 'Long Term';
}

export interface GoalComputed {
  horizon: Horizon;
  effReturn: number; // effective annual return used
  amountRequiredFuture: number; // shortfall to fund via SIP
  sipRequired: number; // level (or stepped) monthly SIP
  allocations: Record<AssetClassKey, number>; // monthly amount per asset class
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

export function computeGoal(goal: FinancialGoalRow, assumptions: AssetClassAssumption[]): GoalComputed {
  const eff = effectiveReturns(assumptions);
  const horizon = horizonFor(num(goal.yearsLeft));
  const effReturn = eff[horizon];
  const fv = amountRequiredFuture(goal, effReturn);
  const sip = sipRequired(fv, num(goal.yearsLeft), effReturn, num(goal.stepUpPct));

  const allocations = {} as Record<AssetClassKey, number>;
  for (const a of assumptions) {
    allocations[a.key] = weightFor(a, horizon) * sip;
  }
  return { horizon, effReturn, amountRequiredFuture: fv, sipRequired: sip, allocations };
}

/** Sum every goal's per-asset SIP allocation → target monthly investment mix. */
export function targetAllocation(
  goals: FinancialGoalRow[],
  assumptions: AssetClassAssumption[],
): Record<AssetClassKey, number> {
  const total = emptyAllocation();
  for (const g of goals) {
    const c = computeGoal(g, assumptions);
    for (const a of assumptions) total[a.key] += c.allocations[a.key];
  }
  return total;
}

function emptyAllocation(): Record<AssetClassKey, number> {
  return {
    domestic_equity: 0,
    us_equity: 0,
    debt: 0,
    gold: 0,
    crypto: 0,
    real_estate: 0,
  };
}

// --- Net worth -------------------------------------------------------------

export interface AssetClassValue {
  key: AssetClassKey;
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

export function computeNetWorth(assets: PlanAssets, liabilities: Liabilities): NetWorthResult {
  const re = assets.realEstate;
  const de = assets.domesticEquity;
  const us = assets.usEquity;
  const debt = assets.debt;
  const gold = assets.gold;

  const domesticStocksMF = sumRows(de.stocks) + sumRows(de.mutualFunds);

  // Custom "other holdings" added under each fixed-field class.
  const reOthers = sumRows(re.others);
  const usOthers = sumRows(us.others);
  const goldOthers = sumRows(gold.others);
  const cryptoOthers = sumRows(assets.crypto.others);

  // Asset-CLASS buckets — mirrors the sheet's "Current Investable Asset
  // Allocation" (Net worth F14:F19): ULIPs and Smallcase are classed as
  // DOMESTIC EQUITY (not debt / US equity), US equity is only S&P/ETF/US MF, and
  // debt excludes ULIPs. This is used for the asset-mix pie, and is deliberately
  // independent of the illiquid/liquid split below.
  const domesticEquityTotal = domesticStocksMF + num(assets.misc.ulips) + num(assets.misc.smallcase);
  const usEquityTotal = num(us.sp500Etf) + num(us.otherEtfs) + num(us.mutualFunds) + usOthers;
  const debtTotal = num(debt.liquidCash) + sumRows(debt.fds) + sumRows(debt.debtFunds) + sumRows(debt.epfPpfVpf);
  const goldTotal = num(gold.jewellery) + num(gold.sgb) + num(gold.goldEtf) + goldOthers;
  const cryptoTotal = num(assets.crypto.crypto) + cryptoOthers;
  const realEstateTotal = num(re.home) + num(re.otherRealEstate) + num(re.reits) + reOthers;

  // Illiquid vs liquid split (mirrors the Net worth sheet C21 / C33). Note this
  // is a DIFFERENT grouping from the asset classes above: ULIPs are illiquid,
  // Smallcase is liquid. Custom "others": real-estate treated as illiquid
  // (property), the rest (US/gold/crypto) as liquid/investable.
  const illiquid =
    num(re.home) +
    num(re.otherRealEstate) +
    reOthers +
    num(gold.jewellery) +
    num(gold.sgb) +
    num(assets.misc.ulips) +
    sumRows(debt.epfPpfVpf);
  const liquid =
    sumRows(debt.fds) +
    sumRows(debt.debtFunds) +
    domesticStocksMF +
    num(us.sp500Etf) +
    num(us.otherEtfs) +
    num(us.mutualFunds) +
    usOthers +
    num(assets.misc.smallcase) +
    num(debt.liquidCash) +
    num(gold.goldEtf) +
    goldOthers +
    cryptoTotal +
    num(re.reits);

  const totalAssets = illiquid + liquid;
  const liab = totalLiabilities(liabilities);

  const byClass: AssetClassValue[] = [
    { key: 'domestic_equity', label: CLASS_LABELS.domestic_equity, value: domesticEquityTotal },
    { key: 'us_equity', label: CLASS_LABELS.us_equity, value: usEquityTotal },
    { key: 'debt', label: CLASS_LABELS.debt, value: debtTotal },
    { key: 'gold', label: CLASS_LABELS.gold, value: goldTotal },
    { key: 'crypto', label: CLASS_LABELS.crypto, value: cryptoTotal },
    { key: 'real_estate', label: CLASS_LABELS.real_estate, value: realEstateTotal },
  ];

  return {
    illiquid,
    liquid,
    totalAssets,
    totalLiabilities: liab,
    netWorth: totalAssets - liab,
    byClass,
  };
}

/** Per-asset-class value totals used by both Net Worth and Portfolio views. */
export function assetClassTotals(assets: PlanAssets): Record<AssetClassKey, number> {
  return computeNetWorth(assets, { items: [] }).byClass.reduce(
    (acc, c) => {
      acc[c.key] = c.value;
      return acc;
    },
    emptyAllocation(),
  );
}

export const CLASS_LABEL = CLASS_LABELS;

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
  return {
    cashFlow: computeCashFlow(plan.cashFlow),
    netWorth: computeNetWorth(plan.assets, plan.liabilities),
    effReturns: effectiveReturns(plan.assumptions),
    target: targetAllocation(plan.goals, plan.assumptions),
  };
}
