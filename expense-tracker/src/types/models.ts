// Central data model. SQL-ready: every relation is by ID, never by name.
// IDs are UUID strings (crypto.randomUUID) so records can be created offline on
// any device and later merged/synced without collisions.

export type ID = string;
/** ISO 8601 string, e.g. "2026-06-28T10:15:00.000Z". */
export type ISODate = string;

export interface Category {
  id: ID;
  name: string;
  icon: string;
  color: string;
  order?: number;
  archived?: boolean;
}

export interface Subcategory {
  id: ID;
  categoryId: ID;
  name: string;
  icon?: string;
  archived?: boolean;
}

export interface Merchant {
  id: ID;
  name: string;
  defaultCategoryId?: ID;
  defaultSubcategoryId?: ID;
}

export interface Context {
  id: ID;
  name: string;
  type?: string;
  color?: string;
}

export interface PaymentMethod {
  id: ID;
  name: string;
}

/** Free-text token -> resolves to a category/subcategory. Powers the parser. */
export interface Alias {
  id: ID;
  text: string; // lowercased trigger word, e.g. "chai"
  categoryId: ID;
  subcategoryId?: ID;
  merchantId?: ID;
}

export interface SalaryCycle {
  id: ID;
  startDate: ISODate;
  endDate?: ISODate; // open cycle has no endDate
  salaryReceived: number;
  note?: string;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly';

/**
 * A template that auto-creates an expense on a schedule (e.g. rent on the 5th
 * of every month). Generated separately from the chat to keep entry simple.
 */
export interface RecurringExpense {
  id: ID;
  amount: number;
  categoryId?: ID;
  subcategoryId?: ID;
  note?: string;
  frequency: RecurringFrequency;
  dayOfWeek?: number; // 0-6, used for weekly
  dayOfMonth?: number; // 1-31, used for monthly
  nextDate: ISODate; // next local-midnight at which to generate an expense
  active: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Expense {
  id: ID;
  amount: number;
  date: ISODate;
  salaryCycleId?: ID;
  categoryId?: ID;
  subcategoryId?: ID;
  merchantId?: ID;
  contextId?: ID;
  paymentMethodId?: ID;
  note?: string;
  rawText?: string; // original chat input, for transparency
  reviewed?: boolean; // user acknowledged a “big spend” so it stops drawing attention
  recurringId?: ID; // set when auto-created from a recurring template
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ActivityType =
  | 'expense.added'
  | 'expense.edited'
  | 'expense.deleted'
  | 'salaryCycle.opened'
  | 'salaryCycle.closed'
  | 'category.added'
  | 'category.edited'
  | 'category.deleted'
  | 'data.imported';

/** Lightweight event log. Append-only; enables undo and change history. */
export interface Activity {
  id: ID;
  type: ActivityType;
  entity: string;
  entityId: ID;
  timestamp: ISODate;
  payload?: unknown;
}

/** Shape of an export/import backup file. `schema` enables forward-compatible imports. */
export interface BackupFile {
  app: 'expense-tracker';
  schema: number;
  exportedAt: ISODate;
  data: {
    categories: Category[];
    subcategories: Subcategory[];
    merchants: Merchant[];
    contexts: Context[];
    paymentMethods: PaymentMethod[];
    aliases: Alias[];
    salaryCycles: SalaryCycle[];
    expenses: Expense[];
    activities: Activity[];
    recurring?: RecurringExpense[];
  };
}
