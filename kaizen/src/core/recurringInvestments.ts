import type { FinancialPlan, HoldingRow, RecurringInvestment, SipDestination, SipFrequency } from '../types/models';
import { newId, now } from './util';

/**
 * Recurring investments (SIPs) — pure scheduling + apply logic.
 *
 * A SIP adds its `amount` to a chosen portfolio destination on a schedule, so
 * the portfolio grows automatically. All functions here are pure (they take a
 * plan/draft and mutate or return values); the caller persists.
 */

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Advance a date to the next occurrence for the frequency. */
export function advanceSip(dateIso: string, freq: SipFrequency, dayOfMonth?: number): string {
  const d = startOfDay(new Date(dateIso));
  if (freq === 'weekly') {
    d.setDate(d.getDate() + 7);
    return startOfDay(d).toISOString();
  }
  const monthsAhead = freq === 'quarterly' ? 3 : 1;
  const day = dayOfMonth ?? d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + monthsAhead, 1);
  const clamped = Math.min(day, lastDayOfMonth(target.getFullYear(), target.getMonth()));
  target.setDate(clamped);
  return startOfDay(target).toISOString();
}

/** First date at/after today that satisfies the schedule. */
export function firstSipDate(freq: SipFrequency, dayOfMonth?: number, dayOfWeek?: number): string {
  const today = startOfDay(new Date());
  if (freq === 'weekly') {
    const target = dayOfWeek ?? today.getDay();
    const diff = (target - today.getDay() + 7) % 7;
    const next = new Date(today);
    next.setDate(today.getDate() + diff);
    return startOfDay(next).toISOString();
  }
  const dom = dayOfMonth ?? today.getDate();
  const thisMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    Math.min(dom, lastDayOfMonth(today.getFullYear(), today.getMonth())),
  );
  if (startOfDay(thisMonth).getTime() >= today.getTime()) return startOfDay(thisMonth).toISOString();
  const step = freq === 'quarterly' ? 3 : 1;
  const nm = new Date(today.getFullYear(), today.getMonth() + step, 1);
  nm.setDate(Math.min(dom, lastDayOfMonth(nm.getFullYear(), nm.getMonth())));
  return startOfDay(nm).toISOString();
}

/** Build a new SIP with its first due date computed. */
export function newSip(input: {
  label: string;
  amount: number;
  destination: SipDestination;
  category?: string;
  frequency: SipFrequency;
  dayOfMonth?: number;
  dayOfWeek?: number;
}): RecurringInvestment {
  const ts = now();
  return {
    id: newId(),
    label: input.label,
    amount: input.amount,
    destination: input.destination,
    category: input.category,
    frequency: input.frequency,
    dayOfMonth: input.dayOfMonth,
    dayOfWeek: input.dayOfWeek,
    nextDate: firstSipDate(input.frequency, input.dayOfMonth, input.dayOfWeek),
    active: true,
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Add `amount` to the SIP's destination inside the plan draft. */
function credit(plan: FinancialPlan, sip: RecurringInvestment, amount: number): void {
  const a = plan.assets;
  const rowId = `sip-${sip.id}`;
  const toRow = (list: HoldingRow[]) => {
    let r = list.find((x) => x.id === rowId);
    if (!r) {
      r = { id: rowId, name: sip.label.trim() || 'SIP', category: sip.category, value: 0 };
      list.push(r);
    }
    r.value += amount;
  };
  switch (sip.destination) {
    case 'domesticStock':
      return toRow(a.domesticEquity.stocks);
    case 'domesticMF':
      return toRow(a.domesticEquity.mutualFunds);
    case 'fd':
      return toRow(a.debt.fds);
    case 'debtFund':
      return toRow(a.debt.debtFunds);
    case 'epf':
      return toRow(a.debt.epfPpfVpf);
    case 'usSp500':
      a.usEquity.sp500Etf += amount;
      return;
    case 'usEtf':
      a.usEquity.otherEtfs += amount;
      return;
    case 'usMf':
      a.usEquity.mutualFunds += amount;
      return;
    case 'smallcase':
      a.misc.smallcase += amount;
      return;
    case 'liquid':
      a.debt.liquidCash += amount;
      return;
    case 'goldEtf':
      a.gold.goldEtf += amount;
      return;
    case 'sgb':
      a.gold.sgb += amount;
      return;
    case 'crypto':
      a.crypto.crypto += amount;
      return;
    case 'reits':
      a.realEstate.reits += amount;
      return;
    case 'ulips':
      a.misc.ulips += amount;
      return;
  }
}

/**
 * Apply every due contribution (nextDate on/before today) for each active SIP,
 * advancing its schedule — catching up any missed periods. Mutates the plan
 * draft. Returns the number of contributions applied (0 = nothing changed).
 */
export function applyDueRecurringInvestments(plan: FinancialPlan): number {
  if (!Array.isArray(plan.recurringInvestments)) return 0;
  const todayEnd = startOfDay(new Date()).getTime() + 86400000 - 1;
  let applied = 0;
  for (const sip of plan.recurringInvestments) {
    if (!sip.active || !(sip.amount > 0)) continue;
    let guard = 0;
    while (new Date(sip.nextDate).getTime() <= todayEnd && guard < 120) {
      credit(plan, sip, sip.amount);
      sip.lastRunAt = sip.nextDate;
      sip.nextDate = advanceSip(sip.nextDate, sip.frequency, sip.dayOfMonth);
      applied++;
      guard++;
    }
    if (guard > 0) sip.updatedAt = now();
  }
  return applied;
}

export const SIP_DESTINATIONS: { value: SipDestination; label: string; group: string; isEquity?: boolean }[] = [
  { value: 'domesticMF', label: 'Domestic mutual fund / ETF', group: 'Domestic Equity', isEquity: true },
  { value: 'domesticStock', label: 'Domestic stock', group: 'Domestic Equity', isEquity: true },
  { value: 'smallcase', label: 'Smallcase', group: 'Domestic Equity' },
  { value: 'usSp500', label: 'US S&P 500 ETF', group: 'US Equity' },
  { value: 'usEtf', label: 'US other ETF', group: 'US Equity' },
  { value: 'usMf', label: 'US mutual fund', group: 'US Equity' },
  { value: 'debtFund', label: 'Debt fund', group: 'Debt' },
  { value: 'fd', label: 'Recurring / Fixed deposit', group: 'Debt' },
  { value: 'epf', label: 'EPF / PPF / VPF', group: 'Debt' },
  { value: 'liquid', label: 'Liquid (savings / cash)', group: 'Debt' },
  { value: 'goldEtf', label: 'Gold ETF / digital gold', group: 'Gold' },
  { value: 'sgb', label: 'SGB', group: 'Gold' },
  { value: 'crypto', label: 'Crypto', group: 'Crypto' },
  { value: 'reits', label: 'REITs', group: 'Real Estate' },
  { value: 'ulips', label: 'ULIP / insurance', group: 'Other' },
];

/** Whether a destination takes an equity cap category. */
export function destinationIsEquity(dest: SipDestination): boolean {
  return dest === 'domesticMF' || dest === 'domesticStock';
}
