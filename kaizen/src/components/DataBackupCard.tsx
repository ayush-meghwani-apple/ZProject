import { useEffect, useRef, useState } from 'react';
import AppIcon from './AppIcon';
import { BackupRepository } from '../repository/backupRepository';
import { saveBackupFile } from '../core/backupFile';
import { getPrefs, setPrefs } from '../core/preferences';
import { ensurePersistentStorage, formatBytes, getStorageEstimate } from '../storage/persistence';

interface Props {
  /** Reload the host's data after an import/restore replaces the database. */
  onReload?: () => void | Promise<void>;
  /** Flush any in-memory state to storage before the backup file is written
   * (e.g. Fortuna's just-edited plan), so nothing recent is missed. */
  beforeExport?: () => Promise<void>;
}

/** "25 Jul, 2:34 pm" — short date + time for the last-backup stamp. */
function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * One shared "Data & Backup" card used everywhere in the app (Expensify,
 * Goals, Notes and Fortuna settings) so backup looks and behaves identically
 * across every sub-app. Shows storage used, the last backup, the
 * export/import/restore actions, and the backup-reminder frequency.
 */
export default function DataBackupCard({ onReload, beforeExport }: Props) {
  const [open, setOpen] = useState(true);
  const [usage, setUsage] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(BackupRepository.getLastBackupAt());
  const [reminderDays, setReminderDays] = useState(getPrefs().backupReminderDays ?? 1);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Keep on-device data durable (best-effort, silent) and read storage usage.
    void ensurePersistentStorage().catch(() => {});
    getStorageEstimate()
      .then((est) => setUsage(est ? formatBytes(est.usage) : ''))
      .catch(() => {});
  }, []);

  const backupDays = BackupRepository.daysSinceBackup();
  const stale = lastBackup === null || backupDays === null || backupDays >= 7;

  async function exportBackup() {
    if (busy) return;
    setBusy(true);
    try {
      if (beforeExport) await beforeExport();
      await saveBackupFile();
      setLastBackup(BackupRepository.getLastBackupAt());
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      await BackupRepository.importAll(parsed);
      await onReload?.();
      setLastBackup(BackupRepository.getLastBackupAt());
      alert('Backup imported ✅');
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  async function restoreBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (
        !confirm(
          'Restore this backup as your ONLY data?\n\nThis erases everything currently in the app (all sub-apps) and replaces it with the backup — use it to recover a clean state. Your other backup files are untouched.',
        )
      ) {
        return;
      }
      await BackupRepository.replaceAll(parsed);
      await onReload?.();
      setLastBackup(BackupRepository.getLastBackupAt());
      alert('Backup restored ✅');
    } catch (err) {
      alert(`Restore failed: ${(err as Error).message}`);
    } finally {
      if (restoreRef.current) restoreRef.current.value = '';
    }
  }

  return (
    <div className="card dbk">
      <button className="scard__head" onClick={() => setOpen((o) => !o)}>
        <span className="scard__icon">
          <AppIcon name="backup" size={22} />
        </span>
        <span className="scard__headtext">
          <span className="scard__title">Data &amp; Backup</span>
          <span className="scard__sub">Keep your data safe and backed up</span>
        </span>
        <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
      </button>

      {open && (
        <div className="dbk__body">
          <div className="dbk__stats">
            <div className="dbk__stat">
              <span className="dbk__staticon">
                <AppIcon name="database" size={18} />
              </span>
              <span className="dbk__stattext">
                <span className="dbk__statlabel">Storage</span>
                <span className="dbk__statval">{usage ? `${usage} used` : '—'}</span>
              </span>
            </div>
            <span className="dbk__divv" />
            <div className="dbk__stat">
              <span className="dbk__staticon">
                <AppIcon name="cloudup" size={18} />
              </span>
              <span className="dbk__stattext">
                <span className="dbk__statlabel">Last backup</span>
                <span className={`dbk__statval${stale ? ' dbk__statval--warn' : ''}`}>
                  {lastBackup ? fmtWhen(lastBackup) : 'Never'}
                </span>
              </span>
            </div>
          </div>

          <div className="dbk__panel">
            <div className="dbk__actions">
              <button className="dbk__act" onClick={exportBackup} disabled={busy}>
                <AppIcon name="export" size={18} /> {busy ? '…' : 'Export'}
              </button>
              <button className="dbk__act" onClick={() => importRef.current?.click()}>
                <AppIcon name="download" size={18} /> Import
              </button>
              <button
                className="dbk__act dbk__act--danger"
                onClick={() => restoreRef.current?.click()}
              >
                <AppIcon name="restore" size={18} /> Restore
              </button>
            </div>
            <span className="dbk__divh" />
            <div className="dbk__remind">
              <span className="dbk__remindlabel">
                <AppIcon name="remind" size={18} /> Backup reminder
              </span>
              <select
                className="input dbk__select"
                value={reminderDays}
                onChange={(e) => {
                  const d = Number(e.target.value);
                  setReminderDays(d);
                  setPrefs({ backupReminderDays: d });
                }}
              >
                <option value={1}>Every day</option>
                <option value={3}>Every 3 days</option>
                <option value={7}>Weekly</option>
                <option value={14}>Every 2 weeks</option>
                <option value={0}>Never</option>
              </select>
            </div>
          </div>

          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={importBackup}
          />
          <input
            ref={restoreRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={restoreBackup}
          />
        </div>
      )}
    </div>
  );
}
