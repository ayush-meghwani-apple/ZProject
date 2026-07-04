import { storage } from '../storage';
import { newId, now } from '../core/util';
import type { ID, NoteDoc } from '../types/models';

export type NewNoteDoc = Omit<NoteDoc, 'id' | 'createdAt' | 'updatedAt'>;

export const NoteDocRepository = {
  async getAll(): Promise<NoteDoc[]> {
    const all = await storage.noteDocs.getAll();
    // Most-recently edited first.
    return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  async get(id: ID): Promise<NoteDoc | undefined> {
    return storage.noteDocs.get(id);
  },

  async add(input: NewNoteDoc): Promise<NoteDoc> {
    const ts = now();
    const doc: NoteDoc = { ...input, id: newId(), createdAt: ts, updatedAt: ts };
    await storage.noteDocs.put(doc);
    return doc;
  },

  async update(doc: NoteDoc): Promise<void> {
    await storage.noteDocs.put({ ...doc, updatedAt: now() });
  },

  /** Move a note to a category (or clear it back to General with undefined). */
  async setCategory(id: ID, categoryId: ID | undefined): Promise<void> {
    const doc = await storage.noteDocs.get(id);
    if (!doc) return;
    await storage.noteDocs.put({ ...doc, categoryId, updatedAt: now() });
  },

  async remove(id: ID): Promise<void> {
    await storage.noteDocs.delete(id);
  },
};
