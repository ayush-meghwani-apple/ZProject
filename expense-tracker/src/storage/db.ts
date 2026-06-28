import Dexie, { type Table } from 'dexie';
import type {
  Activity,
  Alias,
  Category,
  Context,
  Expense,
  Goal,
  GoalPlanItem,
  Merchant,
  PaymentMethod,
  RecurringExpense,
  SalaryCycle,
  Subcategory,
} from '../types/models';

/**
 * The current schema version. Bump this (and add a new `.version(n)` block
 * below) whenever the schema changes. Dexie runs `upgrade()` to migrate
 * existing data instead of dropping it — this is what keeps iterative
 * development from breaking an existing database.
 */
export const SCHEMA_VERSION = 4;

export class ExpenseDB extends Dexie {
  categories!: Table<Category, string>;
  subcategories!: Table<Subcategory, string>;
  merchants!: Table<Merchant, string>;
  contexts!: Table<Context, string>;
  paymentMethods!: Table<PaymentMethod, string>;
  aliases!: Table<Alias, string>;
  salaryCycles!: Table<SalaryCycle, string>;
  expenses!: Table<Expense, string>;
  activities!: Table<Activity, string>;
  recurring!: Table<RecurringExpense, string>;
  goals!: Table<Goal, string>;

  constructor() {
    super('expense-tracker');

    // ---- Version 1 -------------------------------------------------------
    // Only fields used for lookups/sorting need to be indexed.
    this.version(1).stores({
      categories: 'id, name',
      subcategories: 'id, categoryId',
      merchants: 'id, name',
      contexts: 'id, name',
      paymentMethods: 'id, name',
      aliases: 'id, text, subcategoryId, categoryId',
      salaryCycles: 'id, startDate, endDate',
      expenses: 'id, salaryCycleId, categoryId, subcategoryId, date',
      activities: 'id, type, timestamp',
    });

    // ---- Version 2 -------------------------------------------------------
    // Adds recurring-expense templates. Existing stores are repeated so Dexie
    // keeps their data; only the new `recurring` table is introduced.
    this.version(2).stores({
      categories: 'id, name',
      subcategories: 'id, categoryId',
      merchants: 'id, name',
      contexts: 'id, name',
      paymentMethods: 'id, name',
      aliases: 'id, text, subcategoryId, categoryId',
      salaryCycles: 'id, startDate, endDate',
      expenses: 'id, salaryCycleId, categoryId, subcategoryId, date',
      activities: 'id, type, timestamp',
      recurring: 'id, nextDate, active',
    });

    // ---- Version 3 -------------------------------------------------------
    // Adds financial goals (the Goals sub-app). Existing stores are repeated so
    // Dexie keeps their data; only the new `goals` table is introduced.
    this.version(3).stores({
      categories: 'id, name',
      subcategories: 'id, categoryId',
      merchants: 'id, name',
      contexts: 'id, name',
      paymentMethods: 'id, name',
      aliases: 'id, text, subcategoryId, categoryId',
      salaryCycles: 'id, startDate, endDate',
      expenses: 'id, salaryCycleId, categoryId, subcategoryId, date',
      activities: 'id, type, timestamp',
      recurring: 'id, nextDate, active',
      goals: 'id, createdAt',
    });

    // ---- Version 4 -------------------------------------------------------
    // Goals move from a single fixed SIP to a flexible plan of building blocks
    // (recurring savings + lump-sum/FD deposits). Any goal saved under the old
    // shape is migrated into an equivalent set of plan items so nothing is lost.
    this.version(4)
      .stores({
        categories: 'id, name',
        subcategories: 'id, categoryId',
        merchants: 'id, name',
        contexts: 'id, name',
        paymentMethods: 'id, name',
        aliases: 'id, text, subcategoryId, categoryId',
        salaryCycles: 'id, startDate, endDate',
        expenses: 'id, salaryCycleId, categoryId, subcategoryId, date',
        activities: 'id, type, timestamp',
        recurring: 'id, nextDate, active',
        goals: 'id, createdAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('goals')
          .toCollection()
          .modify((g: Record<string, unknown>) => {
            if (Array.isArray(g.items)) return; // already migrated
            const months = Math.max(1, Math.round(Number(g.years ?? 1) * 12));
            const rate = Number(g.expectedReturnPct ?? 0);
            const items: GoalPlanItem[] = [];
            if (Number(g.currentSavings) > 0) {
              items.push({
                id: `${g.id}-savings`,
                kind: 'lumpsum',
                label: 'Current savings',
                amount: Number(g.currentSavings),
                startMonth: 0,
                durationMonths: months,
                annualRatePct: rate,
                compounding: 'monthly',
              });
            }
            if (Number(g.monthlySaving) > 0) {
              items.push({
                id: `${g.id}-sip`,
                kind: 'recurring',
                label: 'Monthly SIP',
                amount: Number(g.monthlySaving),
                startMonth: 0,
                durationMonths: months,
                annualRatePct: rate,
                stepUpPct: Number(g.stepUpPct ?? 0),
              });
            }
            g.items = items;
            delete g.currentSavings;
            delete g.monthlySaving;
            delete g.stepUpPct;
            delete g.expectedReturnPct;
          });
      });
  }
}

export const db = new ExpenseDB();
