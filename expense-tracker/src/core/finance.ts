// Pure finance math for the Goals sub-app. Everything here is side-effect free
// so it can be unit-tested and reused. Percentages are passed as whole numbers
// (e.g. 6 means 6%).

import type { Goal } from '../types/models';

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

export interface GoalProjection {
  targetToday: number;
  targetFuture: number; // inflation-adjusted cost at the goal date
  projectedCorpus: number; // current savings grown + stepped SIP
  invested: number; // total you will have put in (savings + contributions)
  gap: number; // targetFuture - projectedCorpus (>0 = shortfall)
  onTrack: boolean;
  progressPct: number; // projectedCorpus / targetFuture, capped 0..100
  requiredMonthly: number; // level monthly SIP needed to exactly hit the target
}

/** Level monthly SIP required to reach `target`, given a starting lump sum. */
export function requiredMonthlySip(
  target: number,
  currentSavings: number,
  annualReturnPct: number,
  years: number,
): number {
  const i = annualReturnPct / 100 / 12;
  const n = Math.round(years * 12);
  const fromSavings = lumpSumFutureValue(currentSavings, annualReturnPct, years);
  const needed = Math.max(0, target - fromSavings);
  if (n <= 0) return needed;
  if (i === 0) return needed / n;
  // FV of an ordinary annuity factor, with each contribution growing one extra
  // month (contributions at start of month).
  const factor = ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
  return needed / factor;
}

/** Run the full projection for a saved goal. */
export function projectGoal(goal: Goal): GoalProjection {
  const targetFuture = futureCost(goal.presentCost, goal.inflationPct, goal.years);
  const savingsFV = lumpSumFutureValue(goal.currentSavings, goal.expectedReturnPct, goal.years);
  const sip = stepUpSipFutureValue(
    goal.monthlySaving,
    goal.expectedReturnPct,
    goal.stepUpPct,
    goal.years,
  );
  const projectedCorpus = savingsFV + sip.futureValue;
  const invested = goal.currentSavings + sip.invested;
  const gap = targetFuture - projectedCorpus;
  const progressPct =
    targetFuture > 0 ? Math.min(100, Math.max(0, (projectedCorpus / targetFuture) * 100)) : 0;
  return {
    targetToday: goal.presentCost,
    targetFuture,
    projectedCorpus,
    invested,
    gap,
    onTrack: gap <= 0,
    progressPct,
    requiredMonthly: requiredMonthlySip(
      targetFuture,
      goal.currentSavings,
      goal.expectedReturnPct,
      goal.years,
    ),
  };
}
