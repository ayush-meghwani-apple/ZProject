import { db } from '../storage/db';
import { planFlatCategoryMigration } from '../core/flatCategories';

const MIGRATION_KEY = `expense:flatCategories:v3:${db.name}`;

/** Restart-safe automatic migration from legacy category/subcategory data. */
export async function migrateToFlatCategories(force = false): Promise<void> {
  if (!force) {
    try {
      if (localStorage.getItem(MIGRATION_KEY) === 'done') return;
    } catch {
      /* ignore */
    }
  }
  await db.transaction(
    'rw',
    [
      db.categories,
      db.subcategories,
      db.aliases,
      db.expenses,
      db.recurring,
      db.merchants,
    ],
    async () => {
      const plan = planFlatCategoryMigration({
        categories: await db.categories.toArray(),
        subcategories: await db.subcategories.toArray(),
        aliases: await db.aliases.toArray(),
        expenses: await db.expenses.toArray(),
        recurring: await db.recurring.toArray(),
        merchants: await db.merchants.toArray(),
      });

      await db.categories.clear();
      await db.categories.bulkPut(plan.categories);
      await db.subcategories.clear();
      await db.aliases.clear();
      await db.aliases.bulkPut(plan.aliases);
      await db.expenses.bulkPut(plan.expenses);
      await db.recurring.bulkPut(plan.recurring);
      await db.merchants.bulkPut(plan.merchants);
    },
  );
  try {
    localStorage.setItem(MIGRATION_KEY, 'done');
  } catch {
    /* ignore */
  }
}