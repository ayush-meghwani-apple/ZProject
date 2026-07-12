import { storage } from '../storage';
import { SCHEMA_VERSION } from '../storage/db';
import { newId, now } from '../core/util';
import { getLockMeta, setLockMeta, hasPin, clearPin } from '../core/vaultLock';
import { ActivityRepository } from './activityRepository';
import { SalaryCycleRepository } from './salaryCycleRepository';
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
      recurring,
      goals,
      noteDocs,
      noteCategories,
      vaultItems,
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
      storage.recurring.getAll(),
      storage.goals.getAll(),
      storage.noteDocs.getAll(),
      storage.noteCategories.getAll(),
      storage.vaultItems.getAll(),
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
        recurring,
        goals,
        noteDocs,
        noteCategories,
        vaultItems,
      },
      // Non-secret key-derivation params so an encrypted vault can be restored
      // (with the same PIN). Omitted if no vault PIN has been set.
      vaultLock: getLockMeta() ?? undefined,
    };
  },

  /**
   * Imports a backup by upserting every record by id (merge). Importing the
   * same file twice is safe. Used to copy data to another device.
   */
  async importAll(file: BackupFile): Promise<void> {
    if (file.app !== 'expense-tracker') {
      throw new Error('Not an Expensify backup file.');
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
    await storage.recurring.bulkPut(d.recurring ?? []);
    await storage.goals.bulkPut(d.goals ?? []);
    await storage.noteDocs.bulkPut(d.noteDocs ?? []);
    await storage.noteCategories.bulkPut(d.noteCategories ?? []);
    await storage.vaultItems.bulkPut(d.vaultItems ?? []);

    // Only adopt the backup's vault PIN if this device doesn't already have one,
    // so a merge-import never clobbers an existing vault's key.
    if (file.vaultLock && !hasPin()) setLockMeta(file.vaultLock);

    // Backups don't carry the per-expense cycle tag, and expenses may pre-date
    // their cycle — so re-derive cycle membership from each expense's date.
    await SalaryCycleRepository.reassignExpensesByDate();

    await ActivityRepository.log('data.imported', 'backup', newId(), {
      expenses: d.expenses?.length ?? 0,
    });
  },

  /**
   * Restore a backup as the *only* data: wipe every store first, then import.
   * Use this to recover a clean state (e.g. after a messy cycle setup) without
   * having to delete and re-add the home-screen app. Destructive by design.
   */
  async replaceAll(file: BackupFile): Promise<void> {
    if (file.app !== 'expense-tracker') {
      throw new Error('Not a Kaizen backup file.');
    }
    if (file.schema > SCHEMA_VERSION) {
      throw new Error(
        `Backup is from a newer app version (schema ${file.schema}). Update the app first.`,
      );
    }
    await Promise.all([
      storage.categories.clear(),
      storage.subcategories.clear(),
      storage.merchants.clear(),
      storage.contexts.clear(),
      storage.paymentMethods.clear(),
      storage.aliases.clear(),
      storage.salaryCycles.clear(),
      storage.expenses.clear(),
      storage.activities.clear(),
      storage.recurring.clear(),
      storage.goals.clear(),
      storage.noteDocs.clear(),
      storage.noteCategories.clear(),
      storage.vaultItems.clear(),
    ]);
    // Clean restore replaces the vault lock too — drop the local PIN so the
    // backup's lock params (if any) are adopted by importAll.
    clearPin();
    await this.importAll(file);
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

  /** True if there's anything worth backing up yet (so we don't nag empty apps). */
  async hasAnyData(): Promise<boolean> {
    const [expenses, noteDocs, goals] = await Promise.all([
      storage.expenses.getAll(),
      storage.noteDocs.getAll(),
      storage.goals.getAll(),
    ]);
    return expenses.length + noteDocs.length + goals.length > 0;
  },

  /** Whole days since the last export, or null if never backed up. */
  daysSinceBackup(): number | null {
    const last = this.getLastBackupAt();
    if (!last) return null;
    return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  },
};
