import { storage } from '../storage';
import { newId, now } from '../core/util';
import { ActivityRepository } from './activityRepository';
import { SalaryCycleRepository } from './salaryCycleRepository';
import type { Expense, ID } from '../types/models';

export type NewExpenseInput = {
  amount: number;
  categoryId?: ID;
  subcategoryId?: ID;
  merchantId?: ID;
  contextId?: ID;
  paymentMethodId?: ID;
  note?: string;
  rawText?: string;
  date?: string;
  recurringId?: ID;
};

export const ExpenseRepository = {
  getExpenses(): Promise<Expense[]> {
    return storage.expenses.getAll();
  },

  async getExpensesSorted(): Promise<Expense[]> {
    const all = await storage.expenses.getAll();
    return all.sort((a, b) => b.date.localeCompare(a.date));
  },

  async getByCycle(salaryCycleId: ID): Promise<Expense[]> {
    const all = await storage.expenses.getAll();
    return all.filter((e) => e.salaryCycleId === salaryCycleId);
  },

  async addExpense(input: NewExpenseInput): Promise<Expense> {
    const timestamp = now();
    const openCycle = await SalaryCycleRepository.getOpenCycle();

    const expense: Expense = {
      id: newId(),
      amount: input.amount,
      date: input.date ?? timestamp,
      salaryCycleId: openCycle?.id,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      merchantId: input.merchantId,
      contextId: input.contextId,
      paymentMethodId: input.paymentMethodId,
      note: input.note,
      rawText: input.rawText,
      recurringId: input.recurringId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await storage.expenses.put(expense);
    await ActivityRepository.log('expense.added', 'expense', expense.id, {
      amount: expense.amount,
    });
    return expense;
  },

  async updateExpense(expense: Expense): Promise<void> {
    expense.updatedAt = now();
    await storage.expenses.put(expense);
    await ActivityRepository.log('expense.edited', 'expense', expense.id);
  },

  /** Toggle the “reviewed” flag used to calm big-spend highlighting in Reels. */
  async setReviewed(id: ID, reviewed: boolean): Promise<void> {
    const existing = await storage.expenses.get(id);
    if (!existing) return;
    await storage.expenses.put({ ...existing, reviewed, updatedAt: now() });
  },

  async deleteExpense(id: ID): Promise<void> {
    const existing = await storage.expenses.get(id);
    await storage.expenses.delete(id);
    await ActivityRepository.log('expense.deleted', 'expense', id, existing);
  },
};
