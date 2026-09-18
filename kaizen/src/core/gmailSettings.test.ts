import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autoSyncWindowDays,
  clearImportedMemory,
  isDismissed,
  isImported,
  markDismissed,
  markImported,
} from './gmailSettings';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('autoSyncWindowDays', () => {
  const now = Date.parse('2026-09-11T12:00:00.000Z');

  it('uses the manual range when no successful auto-sync checkpoint exists', () => {
    expect(autoSyncWindowDays('', 7, now)).toBe(7);
  });

  it('covers the full elapsed time plus a 24-hour overlap', () => {
    expect(autoSyncWindowDays('2026-09-01T12:00:00.000Z', 7, now)).toBe(11);
  });

  it('keeps the full overlap for a very recent successful sync', () => {
    expect(autoSyncWindowDays('2026-09-11T11:30:00.000Z', 7, now)).toBe(2);
  });
});

describe('clearImportedMemory', () => {
  it('forgets imported messages but preserves dismissed messages', () => {
    markImported('deleted-expense-email');
    markDismissed('marketing-email');

    clearImportedMemory();

    expect(isImported('deleted-expense-email')).toBe(false);
    expect(isDismissed('marketing-email')).toBe(true);
  });
});