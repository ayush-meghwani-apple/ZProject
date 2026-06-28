import Dexie, { type Table } from 'dexie';
import type {
  Activity,
  Alias,
  Category,
  Context,
  Expense,
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
export const SCHEMA_VERSION = 2;

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
  }
}

export const db = new ExpenseDB();
