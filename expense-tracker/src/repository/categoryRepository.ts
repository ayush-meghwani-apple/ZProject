import { storage } from '../storage';
import { newId } from '../core/util';
import { ActivityRepository } from './activityRepository';
import type { Alias, Category, ID, Subcategory } from '../types/models';

export const CategoryRepository = {
  async getCategories(): Promise<Category[]> {
    const all = await storage.categories.getAll();
    // Stable, user-defined order. Categories without an explicit order (older
    // data) fall back to the end, keeping their original relative order.
    return all
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const ao = a.c.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.c.order ?? Number.MAX_SAFE_INTEGER;
        return ao === bo ? a.i - b.i : ao - bo;
      })
      .map((x) => x.c);
  },

  getSubcategories(): Promise<Subcategory[]> {
    return storage.subcategories.getAll();
  },

  getAliases(): Promise<Alias[]> {
    return storage.aliases.getAll();
  },

  async getSubcategoriesFor(categoryId: ID): Promise<Subcategory[]> {
    const all = await storage.subcategories.getAll();
    return all.filter((s) => s.categoryId === categoryId);
  },

  async addCategory(name: string, icon = '📦', color = '#64748b'): Promise<Category> {
    const category: Category = { id: newId(), name, icon, color };
    await storage.categories.put(category);
    // Register the name as an alias so the chat parser can match it.
    await this.addAlias(name, category.id);
    await ActivityRepository.log('category.added', 'category', category.id, { name });
    return category;
  },

  async updateCategory(category: Category): Promise<void> {
    await storage.categories.put(category);
    await ActivityRepository.log('category.edited', 'category', category.id);
  },

  async deleteCategory(id: ID): Promise<void> {
    await storage.categories.delete(id);
    const subs = await this.getSubcategoriesFor(id);
    await Promise.all(subs.map((s) => storage.subcategories.delete(s.id)));
    await ActivityRepository.log('category.deleted', 'category', id);
  },

  /** Move a category up or down one position and persist the new order. */
  async moveCategory(id: ID, direction: -1 | 1): Promise<void> {
    const ordered = await this.getCategories();
    const idx = ordered.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];
    // Re-number everyone so order is always contiguous and well-defined.
    await Promise.all(
      ordered.map((c, i) => storage.categories.put({ ...c, order: i })),
    );
  },

  /** Persist an explicit, fully-ordered list of category ids (drag reorder). */
  async setCategoryOrder(orderedIds: ID[]): Promise<void> {
    const all = await storage.categories.getAll();
    const byId = new Map(all.map((c) => [c.id, c]));
    await Promise.all(
      orderedIds.map((id, i) => {
        const c = byId.get(id);
        return c ? storage.categories.put({ ...c, order: i }) : Promise.resolve();
      }),
    );
  },

  async addSubcategory(categoryId: ID, name: string, icon?: string): Promise<Subcategory> {
    const sub: Subcategory = { id: newId(), categoryId, name, icon: icon?.trim() || undefined };
    await storage.subcategories.put(sub);
    // Register the name as an alias so the chat parser can match it.
    await this.addAlias(name, categoryId, sub.id);
    return sub;
  },

  async updateSubcategory(sub: Subcategory): Promise<void> {
    await storage.subcategories.put(sub);
  },

  async deleteSubcategory(id: ID): Promise<void> {
    await storage.subcategories.delete(id);
    const aliases = await storage.aliases.getAll();
    await Promise.all(
      aliases.filter((a) => a.subcategoryId === id).map((a) => storage.aliases.delete(a.id)),
    );
  },

  async addAlias(text: string, categoryId: ID, subcategoryId?: ID): Promise<Alias> {
    const alias: Alias = {
      id: newId(),
      text: text.toLowerCase().trim(),
      categoryId,
      subcategoryId,
    };
    await storage.aliases.put(alias);
    return alias;
  },
};
