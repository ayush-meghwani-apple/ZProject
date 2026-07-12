import type { Table } from 'dexie';
import { db } from './db';
import type { StorageAdapter, StorageTable } from './StorageAdapter';

/** Wraps a Dexie Table in the generic StorageTable contract. */
function wrap<T extends { id: string }>(table: Table<T, string>): StorageTable<T> {
  return {
    get: (id) => table.get(id),
    getAll: () => table.toArray(),
    put: async (item) => {
      await table.put(item);
    },
    bulkPut: async (items) => {
      await table.bulkPut(items);
    },
    delete: async (id) => {
      await table.delete(id);
    },
    clear: async () => {
      await table.clear();
    },
  };
}

export const indexedDbAdapter: StorageAdapter = {
  categories: wrap(db.categories),
  subcategories: wrap(db.subcategories),
  merchants: wrap(db.merchants),
  contexts: wrap(db.contexts),
  paymentMethods: wrap(db.paymentMethods),
  aliases: wrap(db.aliases),
  salaryCycles: wrap(db.salaryCycles),
  expenses: wrap(db.expenses),
  activities: wrap(db.activities),
  recurring: wrap(db.recurring),
  goals: wrap(db.goals),
  noteDocs: wrap(db.noteDocs),
  noteCategories: wrap(db.noteCategories),
  vaultItems: wrap(db.vaultItems),
  plannerDocs: wrap(db.plannerDocs),
};
