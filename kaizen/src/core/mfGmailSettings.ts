const SETTINGS_KEY = 'fortuna:gmail:settings';
const HANDLED_KEY = 'fortuna:gmail:handledIds';

export const MF_EMAIL_IMPORT_START = '2026-09-01';

export interface MfGmailSettings {
  monthCheckpoints: Record<string, string>;
  lastSyncAt: string;
  lastImported: number;
  lastCreatedFunds: number;
}

const DEFAULTS: MfGmailSettings = {
  monthCheckpoints: {},
  lastSyncAt: '',
  lastImported: 0,
  lastCreatedFunds: 0,
};

export function getMfGmailSettings(): MfGmailSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<MfGmailSettings>;
      return {
        ...DEFAULTS,
        ...stored,
        monthCheckpoints: { ...DEFAULTS.monthCheckpoints, ...stored.monthCheckpoints },
      };
    }
  } catch {
    /* ignore unavailable or corrupt storage */
  }
  return { ...DEFAULTS, monthCheckpoints: {} };
}

export function setMfGmailSettings(patch: Partial<MfGmailSettings>): MfGmailSettings {
  const next = { ...getMfGmailSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

function handledIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HANDLED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

export function isMfEmailHandled(id: string): boolean {
  return handledIds().has(id);
}

export function markMfEmailsHandled(ids: string[]): void {
  const next = handledIds();
  ids.forEach((id) => next.add(id));
  try {
    localStorage.setItem(HANDLED_KEY, JSON.stringify([...next]));
  } catch {
    /* ignore */
  }
}

export function clearMfImportMemory(): void {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(HANDLED_KEY);
  } catch {
    /* ignore */
  }
}