import { describe, it, expect } from 'vitest';
import { generateSipInstallments, settlePendingSips } from './mfSip';
import { nextWorkingDay, isWeekend } from './marketCalendar';
import type { MutualFundHolding, MFTransaction } from '../types/models';
import type { NavPoint } from './amfi';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Daily working-day NAV points (newest-first) from 1 Jun 2026 up to `upTo`. */
function navPoints(upTo: Date, nav = 10): NavPoint[] {
  const pts: NavPoint[] = [];
  const d = new Date(2026, 5, 1);
  while (d.getTime() <= upTo.getTime()) {
    if (!isWeekend(d)) {
      const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      pts.push({ date: dd, iso: dd.toISOString(), nav });
    }
    d.setDate(d.getDate() + 1);
  }
  pts.sort((a, b) => b.date.getTime() - a.date.getTime());
  return pts;
}

function makeFund(dayOfMonth: number, startDate: string, txns: MFTransaction[] = []): MutualFundHolding {
  return {
    id: 'f1',
    schemeCode: 1,
    name: 'Test Fund',
    category: 'flexicap',
    transactions: txns,
    sip: { amount: 5000, dayOfMonth, startDate, active: true },
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

// A Saturday in Aug 2026, so the SIP lands on a weekend.
const saturday = (() => {
  const d = new Date(2026, 7, 1);
  while (!isWeekend(d) || d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d;
})();

describe('SIP weekend handling', () => {
  it('records a processing installment dated the scheduled (weekend) day', () => {
    const start = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate());
    const fund = makeFund(saturday.getDate(), start.toISOString());
    // History only up to the Friday before — the allotment Monday NAV isn't out.
    const points = navPoints(new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate()));
    const txns = generateSipInstallments(fund, points, saturday);

    expect(txns).toHaveLength(1);
    const t = txns[0];
    expect(t.processing).toBe(true);
    expect(t.nav).toBe(0);
    expect(t.units).toBe(0);
    expect(t.amount).toBe(5000);
    // Shown on the scheduled date, NOT rolled to the next working day.
    expect(ymd(new Date(t.date))).toBe(ymd(saturday));
  });

  it('settles a pending installment once the next-working-day NAV publishes', () => {
    const allot = nextWorkingDay(saturday); // the Monday
    const pending: MFTransaction = {
      id: 't1',
      date: new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate()).toISOString(),
      amount: 5000,
      units: 0,
      nav: 0,
      kind: 'sip',
      auto: true,
      processing: true,
    };
    const fund = makeFund(saturday.getDate(), pending.date, [pending]);
    const points = navPoints(allot); // history now includes the allotment day

    const settled = settlePendingSips(fund, points, allot);
    expect(settled).toBe(1);
    const t = fund.transactions[0];
    expect(t.processing).toBeUndefined();
    expect(t.nav).toBe(10);
    expect(t.units).toBeCloseTo(500, 6);
    // The displayed date stays the scheduled Saturday.
    expect(ymd(new Date(t.date))).toBe(ymd(saturday));
  });

  it('prices a normal weekday SIP immediately (no processing)', () => {
    // 1 Jul 2026 is a Wednesday (a trading day).
    const wed = new Date(2026, 6, 1);
    expect(isWeekend(wed)).toBe(false);
    const fund = makeFund(1, wed.toISOString());
    const points = navPoints(new Date(2026, 6, 5));
    const txns = generateSipInstallments(fund, points, new Date(2026, 6, 5));
    expect(txns).toHaveLength(1);
    expect(txns[0].processing).toBeFalsy();
    expect(txns[0].units).toBeCloseTo(500, 6);
    expect(ymd(new Date(txns[0].date))).toBe('2026-07-01');
  });
});
