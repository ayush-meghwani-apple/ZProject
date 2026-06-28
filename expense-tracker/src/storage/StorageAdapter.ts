import type {
  Activity,
  Alias,
  Category,
  Context,
  Expense,
  Goal,
  Merchant,
  PaymentMethod,
  RecurringExpense,
  SalaryCycle,
  Subcategory,
} from '../types/models';

/**
 * Minimal CRUD surface for one collection. Kept deliberately small so any
 * backend (REST, SQLite, Supabase...) can implement it later.
 */
export interface StorageTable<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(item: T): Promise<void>;
  bulkPut(items: T[]): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * The single seam between the app and persistence.
 * Swapping storage engines means writing one new file that implements this.
 */
export interface StorageAdapter {
  categories: StorageTable<Category>;
  subcategories: StorageTable<Subcategory>;
  merchants: StorageTable<Merchant>;
  contexts: StorageTable<Context>;
  paymentMethods: StorageTable<PaymentMethod>;
  aliases: StorageTable<Alias>;
  salaryCycles: StorageTable<SalaryCycle>;
  expenses: StorageTable<Expense>;
  activities: StorageTable<Activity>;
  recurring: StorageTable<RecurringExpense>;
  goals: StorageTable<Goal>;
}
