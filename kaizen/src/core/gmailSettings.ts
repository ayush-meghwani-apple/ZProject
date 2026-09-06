// Small Gmail-import preferences + de-duplication bookkeeping kept in
// localStorage (outside the expense DB), mirroring core/preferences.ts. Holds
// the user's OAuth client id and the set of Gmail message ids already imported
// or dismissed, so re-syncing never double-adds or re-surfaces a transaction.

const SETTINGS_KEY = 'gmail:settings';
const IMPORTED_KEY = 'gmail:importedIds';
const DISMISSED_KEY = 'gmail:dismissedIds';

export interface GmailSettings {
  /** Google OAuth 2.0 Web client id (public; safe in localStorage, not the repo). */
  clientId: string;
  /** How far back to search Gmail on each sync. */
  syncDays: number;
  /** ISO timestamp of the last successful sync, or '' if never. */
  lastSyncAt: string;
  /** ISO timestamp of the last fully successful automatic sync. */
  lastAutoSyncAt: string;
  /** Summary of the last sync, shown in Settings (survives tab switches). */
  lastImported: number;
  lastSkipped: number;
  lastSalary: number;
}

const DEFAULTS: GmailSettings = {
  clientId: '',
  syncDays: 7,
  lastSyncAt: '',
  lastAutoSyncAt: '',
  lastImported: 0,
  lastSkipped: 0,
  lastSalary: 0,
};

export function getGmailSettings(): GmailSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<GmailSettings>;
      const settings = { ...DEFAULTS, ...stored };
      if (!Object.prototype.hasOwnProperty.call(stored, 'lastAutoSyncAt')) {
        settings.lastAutoSyncAt = settings.lastSyncAt;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      }
      return settings;
    }
  } catch {
    /* ignore unavailable/corrupt storage */
  }
  return { ...DEFAULTS };
}

export function setGmailSettings(patch: Partial<GmailSettings>): GmailSettings {
  const next = { ...getGmailSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Gmail's newer_than filter is day-based, so round up with a full-day overlap. */
export function autoSyncWindowDays(
  lastSuccessfulAt: string,
  fallbackDays: number,
  now = Date.now(),
): number {
  const fallback = Math.max(1, Math.floor(fallbackDays) || 1);
  if (!lastSuccessfulAt) return fallback;
  const checkpoint = Date.parse(lastSuccessfulAt);
  if (!Number.isFinite(checkpoint) || checkpoint > now) return fallback;
  return Math.max(1, Math.ceil((now - checkpoint + DAY_MS) / DAY_MS));
}

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

function writeSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

/** True if a Gmail message id was already imported as an expense. */
export function isImported(id: string): boolean {
  return readSet(IMPORTED_KEY).has(id);
}

/** True if the user explicitly dismissed a Gmail message from the review list. */
export function isDismissed(id: string): boolean {
  return readSet(DISMISSED_KEY).has(id);
}

/** Record that a Gmail message became an expense (so it never re-imports). */
export function markImported(id: string): void {
  const set = readSet(IMPORTED_KEY);
  set.add(id);
  writeSet(IMPORTED_KEY, set);
}

/** Record that the user dismissed a Gmail message (hide it on future syncs). */
export function markDismissed(id: string): void {
  const set = readSet(DISMISSED_KEY);
  set.add(id);
  writeSet(DISMISSED_KEY, set);
}

/** Retry previously skipped mail after parser rules improve, without risking duplicate imports. */
export function clearDismissedMemory(): void {
  try {
    localStorage.removeItem(DISMISSED_KEY);
  } catch {
    /* ignore */
  }
}

/** Whether an id should be hidden from the review list (imported or dismissed). */
export function isHandled(id: string): boolean {
  return isImported(id) || isDismissed(id);
}

/** Forget which emails were imported/dismissed and reset the sync summary. */
export function clearImportMemory(): void {
  try {
    localStorage.removeItem(IMPORTED_KEY);
    localStorage.removeItem(DISMISSED_KEY);
  } catch {
    /* ignore */
  }
  setGmailSettings({
    lastImported: 0,
    lastSkipped: 0,
    lastSalary: 0,
    lastSyncAt: '',
    lastAutoSyncAt: '',
  });
}
