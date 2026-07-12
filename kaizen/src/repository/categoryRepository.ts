import { storage } from '../storage';
import { newId } from '../core/util';
import { ActivityRepository } from './activityRepository';
import type { Alias, Category, ID, Subcategory } from '../types/models';

// A palette of visually-distinct colors so each category stands out in the
// reports/charts. New categories pick the first unused one; an on-load pass
// also repairs any older categories that share a color.
const COLOR_PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#64748b', // slate
];

/** Pick a palette color not already in `used`; falls back to a hashed hue. */
function pickColor(used: Set<string>): string {
  const free = COLOR_PALETTE.find((c) => !used.has(c));
  if (free) return free;
  // All palette colors taken — spread extras around the hue wheel.
  const hue = (used.size * 47) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

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

  async addCategory(name: string, icon = '📦', color?: string): Promise<Category> {
    // Give every new category its own distinct color from the palette.
    let chosen = color;
    if (!chosen) {
      const existing = await storage.categories.getAll();
      const used = new Set(existing.map((c) => c.color).filter(Boolean) as string[]);
      chosen = pickColor(used);
    }
    const category: Category = { id: newId(), name, icon, color: chosen };
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

  async deleteAlias(id: ID): Promise<void> {
    await storage.aliases.delete(id);
  },

  /**
   * Repair existing data so every category has a unique color. Keeps colors
   * that are already distinct and only re-assigns duplicates / missing ones,
   * so it's safe to run on every app start. Returns how many were changed.
   */
  async ensureDistinctColors(): Promise<number> {
    const ordered = await this.getCategories();
    const used = new Set<string>();
    let changed = 0;
    for (const cat of ordered) {
      const color = cat.color;
      if (color && !used.has(color)) {
        used.add(color);
        continue;
      }
      const next = pickColor(used);
      used.add(next);
      await storage.categories.put({ ...cat, color: next });
      changed++;
    }
    return changed;
  },
};
