import { describe, expect, it } from 'vitest';
import { planFlatCategoryMigration } from './flatCategories';
import type { Expense } from '../types/models';

describe('planFlatCategoryMigration', () => {
  it('maps the existing hierarchy to flat categories without changing expense data', () => {
    const expense: Expense = {
      id: 'e1',
      amount: 1234,
      date: '2026-09-01T00:00:00.000Z',
      categoryId: 'bengaluru',
      subcategoryId: 'fuel',
      paymentMethodId: 'pm1',
      salaryCycleId: 'cycle1',
      note: 'Petrol',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const plan = planFlatCategoryMigration({
      categories: [{ id: 'bengaluru', name: 'Bengaluru', icon: 'B', color: '#fff' }],
      subcategories: [{ id: 'fuel', categoryId: 'bengaluru', name: 'Activa fuel' }],
      aliases: [{ id: 'a1', text: 'petrol', categoryId: 'bengaluru', subcategoryId: 'fuel' }],
      expenses: [expense],
      recurring: [],
      merchants: [],
    });

    expect(plan.expenses[0]).toEqual({
      ...expense,
      categoryId: 'flat-transport-v1',
      subcategoryId: undefined,
    });
    expect(plan.expenses[0].amount).toBe(expense.amount);
    expect(plan.expenses[0].salaryCycleId).toBe(expense.salaryCycleId);
    expect(plan.aliases.find((alias) => alias.text === 'petrol')?.categoryId).toBe(
      'flat-transport-v1',
    );
  });

  it('is idempotent for already-flat records and maps uncategorized records to Other', () => {
    const base = {
      amount: 1,
      date: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const plan = planFlatCategoryMigration({
      categories: [],
      subcategories: [],
      aliases: [],
      expenses: [
        { id: 'flat', ...base, categoryId: 'flat-food-v1' },
        { id: 'none', ...base },
      ],
      recurring: [],
      merchants: [],
    });
    expect(plan.expenses.map((expense) => expense.categoryId)).toEqual([
      'flat-food-v1',
      'flat-other-v1',
    ]);
  });

  it('maps every shared legacy subcategory to its intended flat category', () => {
    const mappings = [
      ['House hold expenses', 'flat-home-v1'],
      ['Electricity bill', 'flat-home-v1'],
      ['Grocery', 'flat-home-v1'],
      ['Entertainment', 'flat-entertainment-v1'],
      ['Activa service', 'flat-transport-v1'],
      ['FoodeIng', 'flat-food-v1'],
      ['Water', 'flat-home-v1'],
      ['Activa fuel', 'flat-transport-v1'],
      ['Rent', 'flat-home-v1'],
      ['Term insurance', 'flat-bills-v1'],
      ['Movile recharge', 'flat-bills-v1'],
      ['Subscription', 'flat-bills-v1'],
      ['Grooming', 'flat-shopping-v1'],
      ['Shopping', 'flat-shopping-v1'],
      ['Car insurance', 'flat-bills-v1'],
      ['Gifting', 'flat-shopping-v1'],
      ['Coffee exp', 'flat-food-v1'],
      ['Tea talks', 'flat-food-v1'],
      ['Papa transfer', 'flat-family-v1'],
      ['Mobile recharge', 'flat-family-v1'],
      ['Food delivery', 'flat-family-v1'],
      ['Europe trip clear', 'flat-travel-v1'],
      ['Goa trip', 'flat-travel-v1'],
      ['Taiwan trip', 'flat-travel-v1'],
      ['Future savings', 'flat-investments-v1'],
      ['Other', 'flat-other-v1'],
      ['Doctor', 'flat-health-v1'],
      ['Medicine', 'flat-health-v1'],
      ['Gym/Fitness', 'flat-health-v1'],
      ['Gold coin', 'flat-investments-v1'],
    ] as const;
    const categories = [{ id: 'legacy', name: 'Legacy', icon: 'L', color: '#fff' }];
    const subcategories = mappings.map(([name], index) => ({
      id: `sub-${index}`,
      categoryId: 'legacy',
      name,
    }));
    const expenses = mappings.map(([, categoryId], index) => ({
      id: `expense-${index}`,
      amount: index + 1,
      date: '2026-09-01T00:00:00.000Z',
      categoryId: 'legacy',
      subcategoryId: `sub-${index}`,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      expectedCategoryId: categoryId,
    }));
    const plan = planFlatCategoryMigration({
      categories,
      subcategories,
      aliases: [],
      expenses: expenses.map(({ expectedCategoryId: _expected, ...expense }) => expense),
      recurring: [],
      merchants: [],
    });

    expect(plan.expenses.map((expense) => expense.categoryId)).toEqual(
      expenses.map((expense) => expense.expectedCategoryId),
    );
  });
});