import type { Expense } from '../types/models';

/** Newest transaction date first, then newest source/creation time within a day. */
export function compareExpensesNewest(a: Expense, b: Expense): number {
  return (
    b.date.localeCompare(a.date) ||
    (b.emailReceivedAt ?? b.createdAt).localeCompare(a.emailReceivedAt ?? a.createdAt)
  );
}