import { describe, expect, it } from 'vitest';
import { autoSyncWindowDays } from './gmailSettings';

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