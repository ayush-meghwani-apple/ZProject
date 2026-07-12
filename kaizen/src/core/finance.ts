// Pure finance math for the Questify goals sub-app. Everything here is
// side-effect free so it can be unit-tested and reused. Percentages are passed
// as whole numbers (e.g. 6 means 6%).

import type { Compounding, Goal, GoalPlanItem } from '../types/models';

/** Inflate a present-day cost to its value `years` from now. */
export function futureCost(presentCost: number, inflationPct: number, years: number): number {
  return presentCost * Math.pow(1 + inflationPct / 100, years);
}

/** Grow a lump sum at an annual rate, compounded monthly, for `years`. */
export function lumpSumFutureValue(
  principal: number,
  annualReturnPct: number,
  years: number,
): number {
  const i = annualReturnPct / 100 / 12;
  const n = Math.round(years * 12);
  if (i === 0) return principal;
  return principal * Math.pow(1 + i, n);
}

/**
 * Future value of a monthly SIP that steps up once a year. Contributions are
 * made at the start of each month and compound monthly at `annualReturnPct`.
 * Returns both the projected corpus and the total amount actually invested.
 * Used by the standalone Calculator tab.
 */
export function stepUpSipFutureValue(
  monthly: number,
  annualReturnPct: number,
  stepUpPct: number,
  years: number,
): { futureValue: number; invested: number } {
  const i = annualReturnPct / 100 / 12;
  const totalMonths = Math.round(years * 12);
  let futureValue = 0;
  let invested = 0;
  let amount = monthly;
  for (let m = 0; m < totalMonths; m++) {
    // Step the contribution up at the start of each completed year.
    if (m > 0 && m % 12 === 0) {
      amount = amount * (1 + stepUpPct / 100);
    }
    invested += amount;
    const monthsRemaining = totalMonths - m; // grows for the rest of the term
    futureValue += amount * (i === 0 ? 1 : Math.pow(1 + i, monthsRemaining));
  }
  return { futureValue, invested };
}

/** Grow a deposit for a number of months under the chosen compounding. */
function compoundDeposit(
  principal: number,
  annualRatePct: number,
  months: number,
  compounding: Compounding,
): number {
  if (months <= 0 || principal <= 0) return principal > 0 ? principal : 0;
  const r = annualRatePct / 100;
  const t = months / 12;
  switch (compounding) {
    case 'simple':
      return principal * (1 + r * t);
    case 'monthly':
      return principal * Math.pow(1 + r / 12, months);
    case 'yearly':
      return principal * Math.pow(1 + r, t);
    case 'quarterly':
    default:
      return principal * Math.pow(1 + r / 4, 4 * t);
  }
}

export interface PlanItemResult {
  futureValue: number; // value of this block at the goal date
  invested: number; // total rupees you put into this block
}

/**
 * Value of a single plan block at an arbitrary evaluation point `atMonth`
 * (months from the goal start). Use `atMonth = totalMonths` for the goal date,
 * or any earlier month to scrub a timeline.
 *
 * - recurring: each monthly contribution already made by `atMonth` (optionally
 *   stepped up every 12 months) grows at the block's rate for the months that
 *   remain until `atMonth`.
 * - lumpsum: nothing until it is deposited at `startMonth`; then the principal
 *   compounds until it matures, after which the matured cash is held flat
 *   (conservative — assumes it sits idle, not reinvested).
 */
export function planItemValueAtMonth(item: GoalPlanItem, atMonth: number): PlanItemResult {
  if (item.kind === 'recurring') {
    const i = item.annualRatePct / 100 / 12;
    const stepUp = item.stepUpPct ?? 0;
    let futureValue = 0;
    let invested = 0;
    let amount = item.amount;
    for (let k = 0; k < item.durationMonths; k++) {
      const month = item.startMonth + k;
      if (month >= atMonth) break; // not yet contributed by this point
      // Step the contribution up at each completed year of this block.
      if (k > 0 && k % 12 === 0) amount = amount * (1 + stepUp / 100);
      invested += amount;
      const monthsRemaining = atMonth - month;
      futureValue += amount * (i === 0 ? 1 : Math.pow(1 + i, monthsRemaining));
    }
    return { futureValue, invested };
  }

  // lumpsum / FD
  if (item.startMonth >= atMonth) return { futureValue: 0, invested: 0 }; // not deposited yet
  const maturityMonth = item.startMonth + item.durationMonths;
  const grownUntil = Math.min(atMonth, maturityMonth);
  const monthsInvested = Math.max(0, grownUntil - item.startMonth);
  const futureValue = compoundDeposit(
    item.amount,
    item.annualRatePct,
    monthsInvested,
    item.compounding ?? 'quarterly',
  );
  return { futureValue, invested: item.amount };
}

/**
 * Value of a single plan block at the goal date (`totalMonths`). Thin wrapper
 * over {@link planItemValueAtMonth} kept for existing callers.
 */
export function planItemFutureValue(item: GoalPlanItem, totalMonths: number): PlanItemResult {
  return planItemValueAtMonth(item, totalMonths);
}

export interface GoalProjection {
  targetFuture: number; // inflation-adjusted amount needed at the goal date
  projectedCorpus: number; // everything your plan grows to by the goal date
  invested: number; // total rupees you'll put in across all blocks
  gap: number; // targetFuture - projectedCorpus (>0 = shortfall)
  onTrack: boolean;
  progressPct: number; // projectedCorpus / targetFuture, capped 0..100
  extraMonthly: number; // flat extra/month (at 0%) over the term to close a gap
}

/** Run the full projection for a saved goal across all its plan blocks. */
export function projectGoal(goal: Goal): GoalProjection {
  const totalMonths = Math.max(1, Math.round(goal.years * 12));
  const targetFuture = futureCost(goal.presentCost, goal.inflationPct, goal.years);

  let projectedCorpus = 0;
  let invested = 0;
  for (const item of goal.items) {
    const r = planItemFutureValue(item, totalMonths);
    projectedCorpus += r.futureValue;
    invested += r.invested;
  }

  const gap = targetFuture - projectedCorpus;
  const progressPct =
    targetFuture > 0 ? Math.min(100, Math.max(0, (projectedCorpus / targetFuture) * 100)) : 0;
  const extraMonthly = gap > 0 ? gap / totalMonths : 0;

  return {
    targetFuture,
    projectedCorpus,
    invested,
    gap,
    onTrack: gap <= 0,
    progressPct,
    extraMonthly,
  };
}

/** Total corpus and amount invested across all blocks at month `atMonth`. */
export function corpusAtMonth(
  goal: Goal,
  atMonth: number,
): { corpus: number; invested: number } {
  let corpus = 0;
  let invested = 0;
  for (const item of goal.items) {
    const r = planItemValueAtMonth(item, atMonth);
    corpus += r.futureValue;
    invested += r.invested;
  }
  return { corpus, invested };
}

/**
 * Months needed for `current` savings plus a fixed `monthly` contribution
 * (compounding monthly at `annualReturnPct`) to first reach `target`. Returns
 * 0 if already there, or null if it won't be reached within 100 years.
 */
export function monthsToReach(
  target: number,
  current: number,
  monthly: number,
  annualReturnPct: number,
): number | null {
  if (target <= 0 || current >= target) return 0;
  const i = annualReturnPct / 100 / 12;
  let balance = current;
  for (let m = 1; m <= 1200; m++) {
    balance = balance * (1 + i) + monthly;
    if (balance >= target) return m;
  }
  return null;
}

export interface RetirementInput {
  monthlyExpense: number; // today's monthly expense
  inflationPct: number; // annual inflation, %
  yearsToRetire: number; // years from now until you retire
  retireYears: number; // how many years of expenses to fund after retiring
  currentSavings: number; // what you've already saved
  monthlyInvest: number; // what you invest every month now
  stepUpPct: number; // yearly step-up on the monthly investment, %
  returnPct: number; // expected annual return while investing, %
}

export interface RetirementProjection {
  monthlyExpenseAtRetire: number; // today's expense inflated to the retirement year
  requiredCorpus: number; // total needed at retirement to fund every year's withdrawal
  projectedCorpus: number; // what current savings + monthly investing grows to by then
  gap: number; // requiredCorpus - projectedCorpus (>0 = shortfall)
  onTrack: boolean;
  requiredMonthly: number; // starting monthly investment (with the given step-up) to fully fund it
}

/**
 * How much you must accumulate by retirement to cover an inflating expense for
 * `retireYears` years, and whether your current plan gets you there.
 *
 * The required corpus is the sum of each retirement year's expense, grown by
 * inflation from today to that year (conservative — it assumes the corpus isn't
 * earning anything once you start withdrawing). The accumulation side grows
 * current savings plus a stepped-up monthly investment at `returnPct`.
 */
export function projectRetirement(input: RetirementInput): RetirementProjection {
  const annualExpenseToday = input.monthlyExpense * 12;
  const g = 1 + input.inflationPct / 100;
  const yearsToRetire = Math.max(0, input.yearsToRetire);
  const retireYears = Math.max(0, Math.round(input.retireYears));

  let requiredCorpus = 0;
  for (let k = 0; k < retireYears; k++) {
    requiredCorpus += annualExpenseToday * Math.pow(g, yearsToRetire + k);
  }

  const monthlyExpenseAtRetire = input.monthlyExpense * Math.pow(g, yearsToRetire);

  const fromSavings = lumpSumFutureValue(input.currentSavings, input.returnPct, yearsToRetire);
  const sip = stepUpSipFutureValue(
    input.monthlyInvest,
    input.returnPct,
    input.stepUpPct,
    yearsToRetire,
  );
  const projectedCorpus = fromSavings + sip.futureValue;
  const gap = requiredCorpus - projectedCorpus;

  // FV of investing ₹1/month (with the same step-up) — lets us invert for the
  // monthly amount needed to cover whatever the savings alone don't.
  const fvPerRupee = stepUpSipFutureValue(1, input.returnPct, input.stepUpPct, yearsToRetire)
    .futureValue;
  const needFromSip = Math.max(0, requiredCorpus - fromSavings);
  const requiredMonthly = fvPerRupee > 0 ? needFromSip / fvPerRupee : 0;

  return {
    monthlyExpenseAtRetire,
    requiredCorpus,
    projectedCorpus,
    gap,
    onTrack: gap <= 0,
    requiredMonthly,
  };
}
