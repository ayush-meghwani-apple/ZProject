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

/**
 * One building block of a goal's savings plan. Real plans aren't a single SIP:
 * some money sits in a 0% bank account, some is locked into an FD started a few
 * months in for a fixed tenure, some is a stepped-up monthly SIP, etc. A goal
 * is the sum of however many of these blocks you add, so you can model exactly
 * how you intend to reach the target.
 */
export type PlanItemKind = 'recurring' | 'lumpsum';

export type Compounding = 'simple' | 'monthly' | 'quarterly' | 'yearly';

/** Where money in a plan block actually sits, so the plan can be visualised. */
export type SavingsVehicle = 'bank' | 'rd' | 'mutual_fund' | 'bonds' | 'fd' | 'other';

export interface GoalPlanItem {
  id: ID;
  kind: PlanItemKind; // recurring monthly saving, or a one-time lump sum / FD
  label: string; // e.g. "Bank savings", "FD 1"
  amount: number; // recurring: monthly amount · lumpsum: the principal
  startMonth: number; // months from the goal start when this begins (0 = now)
  durationMonths: number; // recurring: how many months you keep paying in
  //                          lumpsum: the FD/deposit tenure
  annualRatePct: number; // expected annual return, % (0 for a plain bank balance)
  stepUpPct?: number; // recurring only: yearly step-up applied to the amount, %
  compounding?: Compounding; // lumpsum only: how the deposit compounds (FD = quarterly)
  vehicle?: SavingsVehicle; // where the money sits (bank, RD, mutual fund, bonds…)
}

/**
 * A financial goal you're saving towards. You set the amount you'll need and
 * when, then build a plan out of {@link GoalPlanItem} blocks. The projection
 * grows every block to the goal date and compares the total against the target
 * so you can see if you're on track.
 */
export interface Goal {
  id: ID;
  name: string;
  icon?: string;
  presentCost: number; // amount needed, in today's money
  inflationPct: number; // annual inflation to grow it to the goal date, % (0 = none)
  years: number; // years from now until you need it (may be fractional)
  items: GoalPlanItem[]; // the savings plan: one or more building blocks
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** A block inside a rich note in the Notes sub-app. */
export type NoteBlockType = 'text' | 'bullets' | 'image' | 'link';

export interface NoteBlock {
  id: ID;
  type: NoteBlockType;
  text?: string; // text: paragraph · bullets: one item per line
  dataUrl?: string; // image: a (downscaled) base64 data URL
  url?: string; // link: the raw URL
  title?: string; // link: optional label (raw for now; unfurled later)
}

/** A rich note in the Notes sub-app: a title plus an ordered list of blocks. */
export interface NoteDoc {
  id: ID;
  title: string;
  blocks: NoteBlock[];
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
    goals?: Goal[];
    noteDocs?: NoteDoc[];
  };
}
