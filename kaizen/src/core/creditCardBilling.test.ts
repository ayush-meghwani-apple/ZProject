import { describe, expect, it } from 'vitest';
import { currentCreditCardCycle, getCreditCardCycleSummaries } from './creditCardBilling';
import type { Expense, PaymentMethod } from '../types/models';

function expense(id: string, date: string, paymentMethodId: string, amount: number, salaryCycleId: string): Expense {
  return {
    id,
    date: new Date(`${date}T12:00:00`).toISOString(),
    paymentMethodId,
    salaryCycleId,
    amount,
    createdAt: new Date(`${date}T12:00:00`).toISOString(),
    updatedAt: new Date(`${date}T12:00:00`).toISOString(),
  };
}

describe('currentCreditCardCycle', () => {
  it('runs from the day after the previous bill through the upcoming bill date', () => {
    const cycle = currentCreditCardCycle(18, new Date(2026, 8, 27));
    expect([cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate()]).toEqual([2026, 8, 19]);
    expect([cycle.end.getFullYear(), cycle.end.getMonth(), cycle.end.getDate()]).toEqual([2026, 9, 18]);
  });

  it('keeps the bill date in the cycle that closes that day', () => {
    const cycle = currentCreditCardCycle(9, new Date(2026, 8, 9));
    expect([cycle.start.getFullYear(), cycle.start.getMonth(), cycle.start.getDate()]).toEqual([2026, 7, 10]);
    expect([cycle.end.getFullYear(), cycle.end.getMonth(), cycle.end.getDate()]).toEqual([2026, 8, 9]);
  });
});

describe('getCreditCardCycleSummaries', () => {
  it('uses card dates and all expenses independently of salary-cycle assignments', () => {
    const methods: PaymentMethod[] = [
      { id: 'au-card', name: 'AU Bank Credit Card' },
      { id: 'hsbc-card', name: 'HSBC Credit Card' },
    ];
    const expenses = [
      expense('before-au', '2026-09-18', 'au-card', 100, 'old-salary-cycle'),
      expense('in-au', '2026-09-19', 'au-card', 250, 'different-salary-cycle'),
      expense('in-hsbc', '2026-09-10', 'hsbc-card', 400, 'another-salary-cycle'),
    ];

    const summaries = getCreditCardCycleSummaries(expenses, methods, new Date(2026, 8, 27));
    expect(summaries.find((row) => row.id === 'au')).toMatchObject({ total: 250, transactionCount: 1, linked: true });
    expect(summaries.find((row) => row.id === 'hsbc')).toMatchObject({ total: 400, transactionCount: 1, linked: true });
    expect(summaries.find((row) => row.id === 'bob')).toMatchObject({ total: 0, transactionCount: 0, linked: false });
  });
});