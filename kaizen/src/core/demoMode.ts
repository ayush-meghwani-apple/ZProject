/**
 * Demo mode — show the app populated with realistic *fake* data (for sharing /
 * feedback) without ever touching your real data or backups.
 *
 * How it stays 100% safe: demo mode does NOT modify the real database. It runs
 * the whole app against a SEPARATE IndexedDB database (`expense-tracker-demo`).
 * Your real database (`expense-tracker`) is never opened for writing while the
 * flag is on, so turning demo mode OFF simply points the app back at your real
 * data — nothing is copied, migrated, or deleted, so there is nothing to lose.
 *
 * The flag lives in localStorage (not in any database), so it is never part of
 * an export/backup and can't leak into either dataset.
 */

const FLAG = 'kaizen.demoMode';

export const REAL_DB_NAME = 'expense-tracker';
export const DEMO_DB_NAME = 'expense-tracker-demo';

/** True when the app is currently showing demo data. */
export function isDemoMode(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

/** The IndexedDB database name the app should open right now. */
export function activeDbName(): string {
  return isDemoMode() ? DEMO_DB_NAME : REAL_DB_NAME;
}

/** Turn demo mode on and reload so the app reopens against the demo database. */
export function enterDemo(): void {
  try {
    localStorage.setItem(FLAG, '1');
  } catch {
    /* ignore */
  }
  location.reload();
}

/** Turn demo mode off and reload so the app reopens against your real data. */
export function exitDemo(): void {
  try {
    localStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
  location.reload();
}

export function toggleDemo(): void {
  if (isDemoMode()) exitDemo();
  else enterDemo();
}
