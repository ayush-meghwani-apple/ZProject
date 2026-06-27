import Dexie, { type Table } from 'dexie';
import type {
  Activity,
  Alias,
  Category,
  Context,
  Expense,
  Merchant,
  PaymentMethod,
  SalaryCycle,
  Subcategory,
} from '../types/models';

/**
 * The current schema version. Bump this (and add a new `.version(n)` block
 * below) whenever the schema changes. Dexie runs `upgrade()` to migrate
 * existing data instead of dropping it — this is what keeps iterative
 * development from breaking an existing database.
 */
export const SCHEMA_VERSION = 1;

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

    // ---- HOW TO ADD A MIGRATION (next week, without breaking data) -------
    //
    // this.version(2).stores({
    //   // repeat existing stores, add new index e.g. expenses: '... , merchantId'
    //   budgets: 'id, categoryId',
    // }).upgrade(async (tx) => {
    //   // backfill / transform existing rows here
    //   await tx.table('expenses').toCollection().modify((e) => {
    //     if (e.someNewField === undefined) e.someNewField = defaultValue;
    //   });
    // });
  }
}

export const db = new ExpenseDB();
