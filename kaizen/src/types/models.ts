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
  icon?: string; // optional emoji shown in pickers/badges
  order?: number; // manual sort position (lower = higher up)
  archived?: boolean;
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

/** A rich note in the Notes sub-app: a title plus a free-form HTML body. */
export interface NoteDoc {
  id: ID;
  title: string;
  body?: string; // free-form HTML (current format)
  blocks?: NoteBlock[]; // legacy block format (pre-1.6.1); migrated to body on open
  categoryId?: ID; // which note category it belongs to (undefined = General)
  pinned?: boolean; // pinned notes float to the top of their category
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** A folder/category grouping notes in the Notes sub-app. */
export interface NoteCategory {
  id: ID;
  name: string;
  emoji: string;
  order: number; // manual sort position (lower = higher up)
  createdAt: ISODate;
}

/**
 * A private savings entry kept in the passcode-locked Vault sub-app (e.g.
 * "Emergency fund 50000", "Gold", "FD at HDFC"). The sensitive fields are stored
 * ENCRYPTED at rest: `enc` holds the AES-GCM ciphertext of {label, amount,
 * note}. The plaintext `label`/`amount`/`note` fields only exist on legacy
 * entries created before encryption (migrated to `enc` on first unlock).
 * Deliberately separate from the expense model so it never shows up in normal
 * spend views.
 */
export interface VaultItem {
  id: ID;
  enc?: string; // encrypted { label, amount, note }
  label?: string; // legacy plaintext (pre-encryption)
  amount?: number; // legacy plaintext
  note?: string; // legacy plaintext
  order?: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------------------------------------------------------------------------
// Fortuna — Financial Planning ("Investments" tile).
//
// Mirrors the user's Master Financial Planner spreadsheet. The ENTIRE plan is a
// single versioned document (id `default`) so it saves atomically and is trivial
// to back up/restore. It is deliberately NOT encrypted (only the screen is
// PIN-gated) so a forgotten PIN can never make the plan unrecoverable. All money
// is INR; all percentages are whole numbers (12 = 12%).
// ---------------------------------------------------------------------------

/** One of the built-in asset classes the planner reasons about. Domestic equity
 *  is split into direct stocks (`domestic_equity`) and mutual funds
 *  (`equity_mf`) so the two can be tracked separately. */
export type AssetClassKey =
  | 'domestic_equity'
  | 'equity_mf'
  | 'us_equity'
  | 'debt'
  | 'gold'
  | 'crypto'
  | 'real_estate';

/**
 * A goal TYPE — a user-defined bucket you assign goals to (e.g. Short, Medium,
 * Retirement, Wealth). Each type just carries a heading and a one-line
 * description; it is NOT derived from a time horizon. Its per-class allocation
 * weights live on the {@link AssetClassAssumption} rows (keyed by this id).
 * (`maxYears` is legacy — only used to migrate pre-goal-type plans; not shown.)
 */
export interface HorizonDef {
  id: string; // 'short' | 'medium' | 'long' | a uuid for custom types
  label: string;
  description?: string; // one-line description of what this goal type means
  maxYears?: number; // legacy: old time-horizon cut-off (migration only)
}

/** The goal types every plan starts with (rename/edit/remove them freely). */
export const DEFAULT_HORIZONS: HorizonDef[] = [
  { id: 'short', label: 'Short term', description: 'Goals within the next few years', maxYears: 3 },
  { id: 'medium', label: 'Medium term', description: 'Goals a handful of years out', maxYears: 7 },
  { id: 'long', label: 'Long term', description: 'Distant, long-horizon goals', maxYears: 999 },
];

/** Expected return + per-horizon allocation weights for one asset class. The
 *  `weights` map is keyed by {@link HorizonDef.id} (whole-number %). `key` is a
 *  built-in {@link AssetClassKey} or a custom class id. */
export interface AssetClassAssumption {
  key: string;
  label: string;
  expectedReturnPct: number; // annual, whole number (e.g. 12)
  weights: Record<string, number>; // horizonId -> allocation weight %
}

/**
 * A user-defined asset category, beyond the six built-in classes. It carries its
 * own holdings list and whether it counts as liquid or illiquid in net worth;
 * its expected return and per-horizon weights live in a matching
 * {@link AssetClassAssumption} row (same id) so it flows into Returns and goals.
 */
export interface CustomAssetClass {
  id: ID;
  label: string;
  liquid: boolean; // true = liquid, false = illiquid (for the net-worth split)
  holdings: HoldingRow[];
}

/** A single line item inside a multi-row holdings list (a stock, MF, FD, an
 *  inflow/outflow/liability line…). */
export interface HoldingRow {
  id: ID;
  name: string;
  category?: string; // e.g. Largecap/Midcap/Smallcap/Flexi, or a bank name
  value: number; // current value / amount in INR
  units?: number; // optional units held (equity holdings) — for tracking
}

/**
 * Cash flow is fully editable: `inflows` and `outflows` are each a list of
 * named lines (name + amount) seeded with sensible defaults, so any line can be
 * renamed, re-valued, removed, or added.
 */
export interface CashFlow {
  inflows: HoldingRow[];
  outflows: HoldingRow[];
  /** Optional custom emergency-fund target. When unset, defaults to 6× monthly
   *  outflows (the recommended value); set it to override. */
  emergencyTarget?: number;
}

/** The full portfolio of holdings, grouped by the spreadsheet's asset sheets.
 *  Each class carries an `others` list so custom named instruments can be added
 *  (and edited) beyond the fixed lines. */
export interface PlanAssets {
  realEstate: { home: number; otherRealEstate: number; reits: number; others: HoldingRow[] };
  domesticEquity: { stocks: HoldingRow[]; mutualFunds: HoldingRow[] };
  usEquity: { sp500Etf: number; otherEtfs: number; mutualFunds: number; others: HoldingRow[] };
  debt: {
    liquidCash: number; // savings account, cash, liquid fund
    fds: HoldingRow[];
    debtFunds: HoldingRow[];
    epfPpfVpf: HoldingRow[];
  };
  gold: { jewellery: number; sgb: number; goldEtf: number; others: HoldingRow[] };
  crypto: { crypto: number; others: HoldingRow[] };
  misc: { ulips: number; smallcase: number };
}

/** Liabilities is a fully-editable list of named lines (seeded with defaults). */
export interface Liabilities {
  items: HoldingRow[];
}

/** Goal priority — a fixed 5-level scale from low to high. */
export type GoalPriority = 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';
export const GOAL_PRIORITIES: GoalPriority[] = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];

/** One financial goal. Derived fields (horizon, future value, SIP, allocation)
 *  are computed at render time and never stored, so they can't go stale. */
export interface FinancialGoalRow {
  id: ID;
  name: string;
  priority?: GoalPriority; // 5-level scale (Very Low … Very High)
  goalTypeId?: string; // which goal type (its allocation weights drive the SIP split)
  yearsLeft: number;
  amountRequiredToday: number;
  amountAvailableToday: number;
  inflationPct: number;
  stepUpPct: number; // annual SIP step-up, whole number %
}

export type SipFrequency = 'weekly' | 'monthly' | 'quarterly';

/** Where a recurring investment's contribution lands in the portfolio. */
export type SipDestination =
  | 'domesticStock'
  | 'domesticMF'
  | 'usSp500'
  | 'usEtf'
  | 'usMf'
  | 'smallcase'
  | 'fd'
  | 'debtFund'
  | 'epf'
  | 'liquid'
  | 'goldEtf'
  | 'sgb'
  | 'crypto'
  | 'reits'
  | 'ulips';

/**
 * A recurring investment (SIP): on its schedule it adds `amount` to a chosen
 * portfolio destination, so the portfolio grows automatically without manual
 * entry. For list destinations (stocks/MFs/FDs/debt funds/EPF) it maintains its
 * own holding row (id `sip-<id>`); for single-value lines it tops up that field.
 */
export interface RecurringInvestment {
  id: ID;
  label: string;
  amount: number; // per period
  destination: SipDestination;
  category?: string; // equity only: Largecap/Midcap/Smallcap/Flexi
  frequency: SipFrequency;
  dayOfMonth?: number; // monthly / quarterly (1–31, clamped)
  dayOfWeek?: number; // weekly (0–6)
  nextDate: ISODate; // next local-midnight the contribution is due
  lastRunAt?: ISODate; // when it last added to the portfolio
  active: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---- Mutual funds (auto-tracked via AMFI NAV) -----------------------------
//
// Unlike the rupee-only `RecurringInvestment`/`HoldingRow`, a tracked mutual
// fund holds a real transaction ledger (units bought at a NAV on a date), so we
// can pull the live NAV from AMFI and compute the true current value plus
// money-weighted returns (XIRR / CAGR) per fund, per category and overall.

/** Broad fund category, used to group returns (large/mid/small/flexi/debt…). */
export type MFCategory = 'largecap' | 'midcap' | 'smallcap' | 'flexicap' | 'hybrid' | 'debt' | 'other';

export const MF_CATEGORIES: { value: MFCategory; label: string }[] = [
  { value: 'largecap', label: 'Large cap' },
  { value: 'midcap', label: 'Mid cap' },
  { value: 'smallcap', label: 'Small cap' },
  { value: 'flexicap', label: 'Flexi / Multi cap' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'debt', label: 'Debt' },
  { value: 'other', label: 'Other' },
];

/** A single buy (SIP installment or lumpsum). Units are normally derived from
 *  `amount / nav`, but every field is editable so you can reconcile with your
 *  broker app if the auto-filled figure differs. */
export interface MFTransaction {
  id: ID;
  date: ISODate; // purchase date (local-midnight ISO)
  amount: number; // INR invested
  units: number; // units allotted
  nav: number; // NAV on the purchase date
  kind: 'sip' | 'lumpsum';
  auto?: boolean; // true = auto-generated from the SIP rule (untouched by user)
  reviewed?: boolean; // user has acknowledged an auto-added buy (clears the review hint)
}

/** A recurring SIP rule for a fund: `amount` invested on `dayOfMonth` every
 *  month from `startDate`. Installments are auto-filled using historical NAV. */
export interface MFSip {
  amount: number;
  dayOfMonth: number; // 1–28 (clamped to month length)
  startDate: ISODate; // first installment date
  active: boolean;
}

/** One auto-tracked mutual fund: an AMFI scheme + its buy ledger + optional SIP.
 *  The latest NAV is cached so a value still shows when offline. */
export interface MutualFundHolding {
  id: ID;
  schemeCode: number; // AMFI scheme code (via api.mfapi.in)
  name: string;
  category: MFCategory;
  transactions: MFTransaction[];
  sip?: MFSip;
  latestNav?: number; // last NAV fetched from AMFI (cache)
  latestNavDate?: ISODate; // the date that NAV is for
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---- General ledger (all asset types) -------------------------------------
//
// The ledger is the master transaction history across EVERY asset class — not
// just mutual funds. Mutual-fund buys live inside their fund (so the Pulse tab
// can price them against live NAV); every OTHER asset type (gold, a custom
// "gold coin" bucket, US stocks, FDs…) records its buys/sells as
// {@link LedgerEntry} rows here. Adding a non-MF entry also drops a matching
// holding line into that asset class in the Portfolio (linked by `holdingId`),
// so the ledger is the input and the portfolio reflects it.

export type LedgerKind = 'buy' | 'sell' | 'sip';

/** One non-mutual-fund transaction in the general ledger. */
export interface LedgerEntry {
  id: ID;
  date: ISODate;
  /** Asset class this belongs to: a built-in {@link AssetClassKey} or a custom
   *  class id. Drives which Portfolio bucket the linked holding sits in. */
  assetClassKey: string;
  name: string; // instrument name, e.g. "Sovereign Gold Coin 24k"
  amount: number; // INR value of this transaction (buy positive)
  units?: number; // optional quantity (coins, grams, shares)
  price?: number; // optional per-unit price
  kind: LedgerKind;
  note?: string;
  auto?: boolean; // added automatically (kept for parity; user reviews it)
  reviewed?: boolean; // user acknowledged an auto-added entry
  /** The Portfolio {@link HoldingRow} this entry maintains (1:1), so editing or
   *  deleting the entry keeps the portfolio in sync. */
  holdingId?: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** A monthly point-in-time snapshot of the plan's headline figures, captured
 *  once per calendar month on open, so the app can show a month-on-month trend
 *  without recomputing history. Oldest→newest. */
export interface PlanSnapshot {
  ym: string; // "yyyy-mm" (the calendar month this snapshot represents)
  at: ISODate; // when it was captured
  netWorth: number;
  totalAssets: number;
  mfInvested: number; // total put into tracked mutual funds
  mfCurrent: number; // current value of tracked mutual funds (units × NAV)
}

/** A daily point-in-time snapshot, captured once per day on open. Powers the
 *  "assets over time" and MF performance line charts, which start from the day
 *  tracking began and build forward (no misleading back-to-inception returns). */
export interface DaySnapshot {
  d: string; // "yyyy-mm-dd" (local day)
  netWorth: number;
  totalAssets: number;
  mfInvested: number; // amount put into tracked mutual funds
  mfValue: number; // current value of tracked mutual funds
  stocks: number; // domestic-equity stocks value
  byClass: Record<string, number>; // asset-class key -> value that day
}

/**
 * The one-and-only Fortuna document. `v` is an internal version used to migrate
 * an older document forward in memory on load (never destructively).
 */
export interface FinancialPlan {
  id: 'default';
  v: number;
  assumptions: AssetClassAssumption[];
  cashFlow: CashFlow;
  assets: PlanAssets;
  liabilities: Liabilities;
  goals: FinancialGoalRow[];
  recurringInvestments: RecurringInvestment[];
  /** Auto-tracked mutual funds (AMFI NAV + SIP ledger + XIRR/CAGR). Optional so
   *  older documents load unchanged; defaulted to `[]` on migrate. */
  mutualFunds?: MutualFundHolding[];
  /** General ledger of non-mutual-fund transactions (gold, custom buckets, US
   *  stocks…). Each maintains a linked Portfolio holding. Defaulted to `[]`. */
  ledger?: LedgerEntry[];
  /** Monthly headline snapshots (net worth / MF value) for the trend charts.
   *  Appended once per calendar month on open; defaulted to `[]`. */
  snapshots?: PlanSnapshot[];
  /** Daily snapshots (net worth, per-class, stocks, MF value/invested) for the
   *  line charts that start from today and build forward. Defaulted to `[]`. */
  daySnapshots?: DaySnapshot[];
  /** Goal time-horizon buckets (Short/Medium/Long + any the user adds). When
   *  absent, {@link DEFAULT_HORIZONS} are assumed. */
  horizons?: HorizonDef[];
  /** User-defined asset categories beyond the six built-ins. Each has a matching
   *  {@link AssetClassAssumption} row (same id) for its return & weights. */
  customClasses?: CustomAssetClass[];
  /** Custom display names for the built-in fixed portfolio lines (e.g. rename
   *  "Home" → "Flat in Pune"). Keyed by a stable line id like `realEstate.home`. */
  fixedLabels?: Record<string, string>;
  /** Asset classes the user has turned off — excluded from net worth, the asset
   *  mix, the Returns table and goal allocations, and shown collapsed at the
   *  bottom of the Portfolio tab. May include custom class ids. */
  disabledClasses?: string[];
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
    noteCategories?: NoteCategory[];
    vaultItems?: VaultItem[];
  };
  /** The whole Fortuna financial plan (single document). Optional so older
   *  backups without it still import. */
  plannerDoc?: FinancialPlan;
  /** Vault key-derivation params (non-secret) so an encrypted vault can be
   *  restored on another device with the same PIN. */
  vaultLock?: {
    v: number;
    salt: string;
    iter: number;
    verifier: string;
  };
}
