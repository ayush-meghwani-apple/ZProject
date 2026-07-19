import { BackupRepository } from '../repository/backupRepository';

/** Fixed file name for an exported backup, so each new save replaces the same
 *  file (in Files / Downloads) instead of piling up one per day. */
export function backupFilename(): string {
  return 'kaizen-backup.json';
}

/**
 * Snapshot the whole database and hand the file to the user to keep somewhere
 * safe (off this device). On iOS / installed PWAs we use the native share sheet
 * so they can pick "Save to Files" (iCloud Drive); everywhere else we fall back
 * to a normal file download.
 *
 * Returns true if the save was initiated, false if the user cancelled.
 */
export async function saveBackupFile(): Promise<boolean> {
  const backup = await BackupRepository.exportAll();
  const json = JSON.stringify(backup, null, 2);
  const name = backupFilename();

  // Prefer the native share sheet when it can share files (iOS Safari / PWA):
  // that's the only reliable way to get a file off an installed iOS web app.
  try {
    const file = new File([json], name, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      // Share ONLY the file — do NOT pass a title/text. iOS "Save to Files"
      // turns any title/text into a second `text.txt`, so the user ends up with
      // two files. Files-only saves the single JSON.
      await nav.share({ files: [file] });
      BackupRepository.markBackedUp();
      return true;
    }
  } catch (err) {
    // The user dismissed the share sheet — don't record a backup.
    if ((err as Error)?.name === 'AbortError') return false;
    // Any other issue: fall through to the download path below.
  }

  // Fallback: trigger a normal file download.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  BackupRepository.markBackedUp();
  return true;
}

/** Whether a backup prompt is due, given the configured interval (in days). */
export function backupDue(intervalDays: number): boolean {
  const last = BackupRepository.getLastBackupAt();
  if (!last) return true;
  const ms = Math.max(1, intervalDays) * 86400000;
  return Date.now() - new Date(last).getTime() >= ms;
}

/**
 * Save an arbitrary JSON object to a file the user keeps (share sheet on iOS /
 * download elsewhere). Used by the Fortuna-only plan export — kept separate from
 * the whole-app backup so the two never get confused. Returns false if the user
 * cancelled the share sheet.
 */
export async function saveJsonFile(obj: unknown, name: string): Promise<boolean> {
  const json = JSON.stringify(obj, null, 2);
  try {
    const file = new File([json], name, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file] });
      return true;
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return false;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

