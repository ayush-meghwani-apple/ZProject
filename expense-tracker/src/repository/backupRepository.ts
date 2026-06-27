import { storage } from '../storage';
import { SCHEMA_VERSION } from '../storage/db';
import { newId, now } from '../core/util';
import { ActivityRepository } from './activityRepository';
import type { BackupFile } from '../types/models';

export const BackupRepository = {
  /** Snapshots the entire database into a portable JSON object. */
  async exportAll(): Promise<BackupFile> {
    const [
      categories,
      subcategories,
      merchants,
      contexts,
      paymentMethods,
      aliases,
      salaryCycles,
      expenses,
      activities,
    ] = await Promise.all([
      storage.categories.getAll(),
      storage.subcategories.getAll(),
      storage.merchants.getAll(),
      storage.contexts.getAll(),
      storage.paymentMethods.getAll(),
      storage.aliases.getAll(),
      storage.salaryCycles.getAll(),
      storage.expenses.getAll(),
      storage.activities.getAll(),
    ]);

    return {
      app: 'expense-tracker',
      schema: SCHEMA_VERSION,
      exportedAt: now(),
      data: {
        categories,
        subcategories,
        merchants,
        contexts,
        paymentMethods,
        aliases,
        salaryCycles,
        expenses,
        activities,
      },
    };
  },

  /**
   * Imports a backup by upserting every record by id (merge). Importing the
   * same file twice is safe. Used to copy data to another device.
   */
  async importAll(file: BackupFile): Promise<void> {
    if (file.app !== 'expense-tracker') {
      throw new Error('Not an Expense Tracker backup file.');
    }
    if (file.schema > SCHEMA_VERSION) {
      throw new Error(
        `Backup is from a newer app version (schema ${file.schema}). Update the app first.`,
      );
    }

    const d = file.data;
    await storage.categories.bulkPut(d.categories ?? []);
    await storage.subcategories.bulkPut(d.subcategories ?? []);
    await storage.merchants.bulkPut(d.merchants ?? []);
    await storage.contexts.bulkPut(d.contexts ?? []);
    await storage.paymentMethods.bulkPut(d.paymentMethods ?? []);
    await storage.aliases.bulkPut(d.aliases ?? []);
    await storage.salaryCycles.bulkPut(d.salaryCycles ?? []);
    await storage.expenses.bulkPut(d.expenses ?? []);
    await storage.activities.bulkPut(d.activities ?? []);

    await ActivityRepository.log('data.imported', 'backup', newId(), {
      expenses: d.expenses?.length ?? 0,
    });
  },

  /** Records that the user exported a backup (localStorage, separate from the DB). */
  markBackedUp(): void {
    try {
      localStorage.setItem('expense:lastBackupAt', new Date().toISOString());
    } catch {
      /* storage unavailable — ignore */
    }
  },

  getLastBackupAt(): string | null {
    try {
      return localStorage.getItem('expense:lastBackupAt');
    } catch {
      return null;
    }
  },

  /** Whole days since the last export, or null if never backed up. */
  daysSinceBackup(): number | null {
    const last = this.getLastBackupAt();
    if (!last) return null;
    return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  },
};
