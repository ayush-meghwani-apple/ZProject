import { describe, expect, it } from 'vitest';
import type { Expense } from '../types/models';
import { compareExpensesNewest } from './expenseSort';

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: 'expense',
    amount: 100,
    date: '2026-09-18T00:00:00.000Z',
    createdAt: '2026-09-18T12:00:00.000Z',
    updatedAt: '2026-09-18T12:00:00.000Z',
    ...overrides,
  };
}

describe('compareExpensesNewest', () => {
  it('orders same-day Gmail expenses by newest email arrival first', () => {
    const earlier = expense({ id: 'earlier', emailReceivedAt: '2026-09-18T08:00:00.000Z' });
    const later = expense({ id: 'later', emailReceivedAt: '2026-09-18T10:00:00.000Z' });

    expect([earlier, later].sort(compareExpensesNewest).map((item) => item.id)).toEqual([
      'later',
      'earlier',
    ]);
  });

  it('keeps newer transaction dates ahead of email arrival time', () => {
    const olderDay = expense({
      id: 'older-day',
      date: '2026-09-17T00:00:00.000Z',
      emailReceivedAt: '2026-09-18T23:00:00.000Z',
    });
    const newerDay = expense({
      id: 'newer-day',
      emailReceivedAt: '2026-09-18T01:00:00.000Z',
    });

    expect([olderDay, newerDay].sort(compareExpensesNewest).map((item) => item.id)).toEqual([
      'newer-day',
      'older-day',
    ]);
  });
});