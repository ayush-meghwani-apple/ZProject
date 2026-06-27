import { storage } from '../storage';
import { newId } from '../core/util';
import { ActivityRepository } from './activityRepository';
import type { Alias, Category, ID, Subcategory } from '../types/models';

export const CategoryRepository = {
  getCategories(): Promise<Category[]> {
    return storage.categories.getAll();
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

  async addSubcategory(categoryId: ID, name: string): Promise<Subcategory> {
    const sub: Subcategory = { id: newId(), categoryId, name };
    await storage.subcategories.put(sub);
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
