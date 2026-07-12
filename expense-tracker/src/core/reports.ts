import type { Category, Expense, PaymentMethod, Subcategory } from '../types/models';

const SUB_PALETTE = [
  '#38bdf8',
  '#22c55e',
  '#f97316',
  '#ec4899',
  '#a855f7',
  '#eab308',
  '#14b8a6',
  '#ef4444',
  '#64748b',
  '#f43f5e',
];

export interface CategorySummaryRow {
  categoryId: string;
  name: string;
  color: string;
  total: number;
  count: number;
}

export interface MonthlyTotalRow {
  month: string; // "2026-06"
  label: string; // "Jun 2026"
  total: number;
}

/** Sum of all expense amounts. */
export function totalSpend(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

/** Spend grouped by category, sorted high to low. Pure — no storage access. */
export function getCategorySummary(
  expenses: Expense[],
  categories: Category[],
): CategorySummaryRow[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, { total: number; count: number }>();

  for (const e of expenses) {
    const key = e.categoryId ?? 'uncategorized';
    const entry = totals.get(key) ?? { total: 0, count: 0 };
    entry.total += e.amount;
    entry.count += 1;
    totals.set(key, entry);
  }

  return Array.from(totals.entries())
    .map(([categoryId, { total, count }]) => {
      const cat = byId.get(categoryId);
      return {
        categoryId,
        name: cat?.name ?? 'Uncategorized',
        color: cat?.color ?? '#94a3b8',
        total,
        count,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface SubcategorySummaryRow {
  subcategoryId: string;
  name: string;
  total: number;
  count: number;
  color: string;
}

export interface PaymentMethodSummaryRow {
  methodId: string; // '' for untagged
  name: string;
  icon?: string;
  total: number;
  count: number;
  color: string;
}

/** Spend grouped by payment method (untagged expenses bucket under ''). Pure. */
export function getPaymentMethodSummary(
  expenses: Expense[],
  methods: PaymentMethod[],
): PaymentMethodSummaryRow[] {
  const byId = new Map(methods.map((m) => [m.id, m]));
  const totals = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const key = e.paymentMethodId && byId.has(e.paymentMethodId) ? e.paymentMethodId : '';
    const entry = totals.get(key) ?? { total: 0, count: 0 };
    entry.total += e.amount;
    entry.count += 1;
    totals.set(key, entry);
  }
  return Array.from(totals.entries())
    .map(([methodId, { total, count }], i) => {
      const m = byId.get(methodId);
      return {
        methodId,
        name: m?.name ?? 'Untagged',
        icon: m?.icon,
        total,
        count,
        color: methodId ? SUB_PALETTE[i % SUB_PALETTE.length] : '#94a3b8',
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Spend within one category, broken down by subcategory. Pure function. */
export function getSubcategorySummary(
  expenses: Expense[],
  subcategories: Subcategory[],
  categoryId: string,
): SubcategorySummaryRow[] {
  const subById = new Map(subcategories.map((s) => [s.id, s]));
  const totals = new Map<string, { total: number; count: number }>();

  for (const e of expenses) {
    if (e.categoryId !== categoryId) continue;
    const key = e.subcategoryId ?? 'none';
    const entry = totals.get(key) ?? { total: 0, count: 0 };
    entry.total += e.amount;
    entry.count += 1;
    totals.set(key, entry);
  }

  return Array.from(totals.entries())
    .map(([subcategoryId, { total, count }], i) => ({
      subcategoryId,
      name: subById.get(subcategoryId)?.name ?? 'Unspecified',
      total,
      count,
      color: SUB_PALETTE[i % SUB_PALETTE.length],
    }))
    .sort((a, b) => b.total - a.total);
}

/** N most expensive single expenses. */
export function getTopExpenses(expenses: Expense[], limit = 5): Expense[] {
  return [...expenses].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export interface SubBreakdownRow {
  subcategoryId: string;
  name: string;
  icon?: string;
  total: number;
  count: number;
}

export interface CategoryBreakdownRow {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  count: number;
  subs: SubBreakdownRow[];
}

/**
 * Full nested breakdown: every category that has spend, each with its
 * sub-categories. Sorted high-to-low at both levels. Pure function.
 */
export function getCategoryBreakdown(
  expenses: Expense[],
  categories: Category[],
  subcategories: Subcategory[],
): CategoryBreakdownRow[] {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const subById = new Map(subcategories.map((s) => [s.id, s]));

  const cats = new Map<
    string,
    { total: number; count: number; subs: Map<string, { total: number; count: number }> }
  >();

  for (const e of expenses) {
    const cKey = e.categoryId ?? 'uncategorized';
    const cat = cats.get(cKey) ?? { total: 0, count: 0, subs: new Map() };
    cat.total += e.amount;
    cat.count += 1;
    const sKey = e.subcategoryId ?? 'none';
    const sub = cat.subs.get(sKey) ?? { total: 0, count: 0 };
    sub.total += e.amount;
    sub.count += 1;
    cat.subs.set(sKey, sub);
    cats.set(cKey, cat);
  }

  return Array.from(cats.entries())
    .map(([categoryId, c]) => {
      const cat = catById.get(categoryId);
      return {
        categoryId,
        name: cat?.name ?? 'Uncategorized',
        icon: cat?.icon ?? '📦',
        color: cat?.color ?? '#94a3b8',
        total: c.total,
        count: c.count,
        subs: Array.from(c.subs.entries())
          .map(([subcategoryId, s]) => {
            const sub = subById.get(subcategoryId);
            return {
              subcategoryId,
              name: sub?.name ?? 'Unspecified',
              icon: sub?.icon,
              total: s.total,
              count: s.count,
            };
          })
          .sort((a, b) => b.total - a.total),
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Average spend per distinct day that has at least one expense. */
export function getDailyAverage(expenses: Expense[]): number {
  if (expenses.length === 0) return 0;
  const days = new Set(expenses.map((e) => e.date.slice(0, 10)));
  return totalSpend(expenses) / days.size;
}

/** Number of distinct salary cycles represented in the expenses. */
export function countCycles(expenses: Expense[]): number {
  return new Set(expenses.map((e) => e.salaryCycleId ?? 'none')).size;
}

/** Average spend per cycle. */
export function getCycleAverage(expenses: Expense[]): number {
  if (expenses.length === 0) return 0;
  return totalSpend(expenses) / countCycles(expenses);
}

/** Totals grouped by calendar month, oldest first. */
export function getMonthlyTotals(expenses: Expense[]): MonthlyTotalRow[] {
  const totals = new Map<string, number>();
  for (const e of expenses) {
    const month = e.date.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + e.amount);
  }
  return Array.from(totals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, total]) => {
      const [y, m] = month.split('-');
      const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
      });
      return { month, label, total };
    });
}
