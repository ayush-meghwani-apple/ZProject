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

  async add(input: NewNoteDoc): Promise<NoteDoc> {
    const ts = now();
    const doc: NoteDoc = { ...input, id: newId(), createdAt: ts, updatedAt: ts };
    await storage.noteDocs.put(doc);
    return doc;
  },

  async update(doc: NoteDoc): Promise<void> {
    await storage.noteDocs.put({ ...doc, updatedAt: now() });
  },

  async remove(id: ID): Promise<void> {
    await storage.noteDocs.delete(id);
  },
};
