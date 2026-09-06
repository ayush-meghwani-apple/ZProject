import type { Alias, Category, Expense, Merchant, RecurringExpense, Subcategory } from '../types/models';

export const FLAT_CATEGORIES: Category[] = [
  { id: 'flat-home-v1', name: 'Home', icon: '🏠', color: '#ef4444', order: 0 },
  { id: 'flat-food-v1', name: 'Food', icon: '🍽️', color: '#f97316', order: 1 },
  { id: 'flat-transport-v1', name: 'Transport', icon: '🛵', color: '#0ea5e9', order: 2 },
  { id: 'flat-bills-v1', name: 'Bills & Insurance', icon: '🧾', color: '#8b5cf6', order: 3 },
  { id: 'flat-health-v1', name: 'Health', icon: '💊', color: '#22c55e', order: 4 },
  { id: 'flat-shopping-v1', name: 'Shopping & Self-care', icon: '🛍️', color: '#ec4899', order: 5 },
  { id: 'flat-entertainment-v1', name: 'Entertainment', icon: '🎬', color: '#eab308', order: 6 },
  { id: 'flat-travel-v1', name: 'Travel', icon: '✈️', color: '#14b8a6', order: 7 },
  { id: 'flat-family-v1', name: 'Family', icon: '👨‍👩‍👧', color: '#6366f1', order: 8 },
  { id: 'flat-investments-v1', name: 'Savings', icon: '📈', color: '#10b981', order: 9 },
  { id: 'flat-other-v1', name: 'Other', icon: '📦', color: '#64748b', order: 10 },
];

export const INVESTMENTS_CATEGORY_ID = 'flat-investments-v1';

const FLAT_BY_NAME = new Map(FLAT_CATEGORIES.map((category) => [category.name.toLowerCase(), category.id]));

const SUBCATEGORY_TARGET: Record<string, string> = {
  'house hold expenses': 'Home',
  'electricity bill': 'Home',
  grocery: 'Home',
  groceries: 'Home',
  water: 'Home',
  rent: 'Home',
  household: 'Home',
  electricity: 'Home',
  foodeing: 'Food',
  'coffee exp': 'Food',
  'tea talks': 'Food',
  'tea/coffee': 'Food',
  snacks: 'Food',
  restaurant: 'Food',
  'activa service': 'Transport',
  'activa fuel': 'Transport',
  'auto/cab': 'Transport',
  fuel: 'Transport',
  'public transit': 'Transport',
  'term insurance': 'Bills & Insurance',
  'movile recharge': 'Bills & Insurance',
  subscription: 'Bills & Insurance',
  'mobile/internet': 'Bills & Insurance',
  'car insurance': 'Bills & Insurance',
  grooming: 'Shopping & Self-care',
  shopping: 'Shopping & Self-care',
  clothing: 'Shopping & Self-care',
  electronics: 'Shopping & Self-care',
  gifting: 'Shopping & Self-care',
  entertainment: 'Entertainment',
  movies: 'Entertainment',
  outing: 'Entertainment',
  doctor: 'Health',
  medicine: 'Health',
  'gym/fitness': 'Health',
  'papa transfer': 'Family',
  'mobile recharge': 'Family',
  'food delivery': 'Family',
  'europe trip clear': 'Travel',
  'goa trip': 'Travel',
  'taiwan trip': 'Travel',
  'future savings': 'Travel',
  'future trip savings': 'Travel',
  'gold coin': 'Savings',
  other: 'Other',
};

const PARENT_TARGET: Record<string, string> = {
  bengaluru: 'Home',
  ayush: 'Shopping & Self-care',
  home: 'Family',
  trips: 'Travel',
  misc: 'Other',
  health: 'Health',
  investment: 'Savings',
  food: 'Food',
  transport: 'Transport',
  bills: 'Bills & Insurance',
  shopping: 'Shopping & Self-care',
  entertainment: 'Entertainment',
};

export interface FlatMigrationInput {
  categories: Category[];
  subcategories: Subcategory[];
  aliases: Alias[];
  expenses: Expense[];
  recurring: RecurringExpense[];
  merchants: Merchant[];
}

export interface FlatMigrationPlan {
  categories: Category[];
  aliases: Alias[];
  expenses: Expense[];
  recurring: RecurringExpense[];
  merchants: Merchant[];
}

export function planFlatCategoryMigration(input: FlatMigrationInput): FlatMigrationPlan {
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const subcategoryById = new Map(input.subcategories.map((subcategory) => [subcategory.id, subcategory]));
  const flatIds = new Set(FLAT_CATEGORIES.map((category) => category.id));

  function targetCategoryId(categoryId?: string, subcategoryId?: string): string {
    if (categoryId && flatIds.has(categoryId)) return categoryId;
    const subcategory = subcategoryId ? subcategoryById.get(subcategoryId) : undefined;
    const category = categoryId ? categoryById.get(categoryId) : undefined;
    const targetName =
      (subcategory && SUBCATEGORY_TARGET[subcategory.name.trim().toLowerCase()]) ||
      (category && PARENT_TARGET[category.name.trim().toLowerCase()]) ||
      (category && FLAT_BY_NAME.has(category.name.trim().toLowerCase()) ? category.name : undefined) ||
      'Other';
    return FLAT_BY_NAME.get(targetName.toLowerCase()) ?? 'flat-other-v1';
  }

  function targetExpenseCategoryId(expense: Expense, subcategoryId?: string): string {
    const legacyText = `${expense.note ?? ''} ${expense.rawText ?? ''}`;
    if (/\bfuture(?:\s+trip)?\s+savings\b/i.test(legacyText)) return 'flat-travel-v1';
    return targetCategoryId(expense.categoryId, subcategoryId);
  }

  const expenses = input.expenses.map(({ subcategoryId, ...expense }) => ({
    ...expense,
    categoryId: targetExpenseCategoryId(expense, subcategoryId),
  }));
  const recurring = input.recurring.map(({ subcategoryId, ...item }) => ({
    ...item,
    categoryId: targetCategoryId(item.categoryId, subcategoryId),
  }));
  const merchants = input.merchants.map(({ defaultSubcategoryId, ...merchant }) => ({
    ...merchant,
    defaultCategoryId: targetCategoryId(merchant.defaultCategoryId, defaultSubcategoryId),
  }));

  const aliasesByKey = new Map<string, Alias>();
  for (const alias of input.aliases) {
    const normalized = alias.text.trim().toLowerCase();
    const categoryId = /\bfuture(?:\s+trip)?\s+savings\b/i.test(normalized)
      ? 'flat-travel-v1'
      : targetCategoryId(alias.categoryId, alias.subcategoryId);
    const key = `${categoryId}|${normalized}`;
    if (!aliasesByKey.has(key)) {
      aliasesByKey.set(key, { id: alias.id, text: normalized, categoryId });
    }
  }
  for (const category of FLAT_CATEGORIES) {
    const text = category.name.toLowerCase();
    const key = `${category.id}|${text}`;
    if (!aliasesByKey.has(key)) {
      aliasesByKey.set(key, { id: `flat-alias-${category.id}`, text, categoryId: category.id });
    }
  }

  return {
    categories: FLAT_CATEGORIES.map((category) => ({ ...category })),
    aliases: [...aliasesByKey.values()],
    expenses,
    recurring,
    merchants,
  };
}