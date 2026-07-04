import { storage } from '../storage';
import { newId, now } from '../core/util';
import type { ID, NoteCategory } from '../types/models';

export type NewNoteCategory = { name: string; emoji: string };

/** CRUD + ordering for the Notes sub-app's categories (folders). */
export const NoteCategoryRepository = {
  /** All categories, in their manual order. */
  async getAll(): Promise<NoteCategory[]> {
    const all = await storage.noteCategories.getAll();
    return all.sort((a, b) => a.order - b.order);
  },

  async add(input: NewNoteCategory): Promise<NoteCategory> {
    const existing = await storage.noteCategories.getAll();
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.order), -1);
    const cat: NoteCategory = {
      id: newId(),
      name: input.name.trim() || 'Untitled',
      emoji: input.emoji || '🗂️',
      order: maxOrder + 1,
      createdAt: now(),
    };
    await storage.noteCategories.put(cat);
    return cat;
  },

  async update(cat: NoteCategory): Promise<void> {
    await storage.noteCategories.put(cat);
  },

  /** Delete a category; its notes fall back to "General" (categoryId cleared). */
  async remove(id: ID): Promise<void> {
    const notes = await storage.noteDocs.getAll();
    const orphans = notes.filter((n) => n.categoryId === id);
    for (const n of orphans) {
      await storage.noteDocs.put({ ...n, categoryId: undefined });
    }
    await storage.noteCategories.delete(id);
  },

  /** Move a category up (-1) or down (+1) by swapping order with its neighbour. */
  async move(id: ID, dir: -1 | 1): Promise<void> {
    const cats = await this.getAll();
    const i = cats.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cats.length) return;
    const a = cats[i];
    const b = cats[j];
    const ao = a.order;
    a.order = b.order;
    b.order = ao;
    await storage.noteCategories.put(a);
    await storage.noteCategories.put(b);
  },
};
