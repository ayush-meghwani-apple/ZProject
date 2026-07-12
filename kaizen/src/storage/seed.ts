import { storage } from './index';
import seedData from '../config/categories.json';
import { newId, now } from '../core/util';
import type { Alias, Category, PaymentMethod, Subcategory } from '../types/models';

/**
 * Populates the database the first time the app runs. Idempotent: it only
 * seeds when the categories table is empty, so it is safe to call on every
 * startup and will never duplicate data.
 */
export async function seedIfEmpty(): Promise<void> {
  const existing = await storage.categories.getAll();
  if (existing.length > 0) return;

  const categories: Category[] = [];
  const subcategories: Subcategory[] = [];
  const aliases: Alias[] = [];

  for (const cat of seedData.categories) {
    const categoryId = newId();
    categories.push({
      id: categoryId,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
    });

    for (const sub of cat.subcategories) {
      const subcategoryId = newId();
      subcategories.push({ id: subcategoryId, categoryId, name: sub.name });

      for (const text of sub.aliases ?? []) {
        aliases.push({
          id: newId(),
          text: text.toLowerCase(),
          categoryId,
          subcategoryId,
        });
      }
    }
  }

  const paymentMethods: PaymentMethod[] = seedData.paymentMethods.map((name) => ({
    id: newId(),
    name,
  }));

  await storage.categories.bulkPut(categories);
  await storage.subcategories.bulkPut(subcategories);
  await storage.aliases.bulkPut(aliases);
  await storage.paymentMethods.bulkPut(paymentMethods);

  // Record the seed as an activity so history is complete from day one.
  await storage.activities.put({
    id: newId(),
    type: 'data.imported',
    entity: 'seed',
    entityId: 'seed',
    timestamp: now(),
    payload: { categories: categories.length, aliases: aliases.length },
  });
}
