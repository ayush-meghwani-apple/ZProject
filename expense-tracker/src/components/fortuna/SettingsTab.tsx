import { useRef, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import { BackupRepository } from '../../repository/backupRepository';
import { defaultPlan } from '../../repository/plannerRepository';
import { saveBackupFile } from '../../core/backupFile';
import AppIcon from '../AppIcon';
import { Section } from './shared';

interface Props extends FortunaTabProps {
  onLock: () => void;
  reload: () => Promise<void>;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SettingsTab({ update, onLock, reload }: Props) {
  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(BackupRepository.getLastBackupAt());
  const [busy, setBusy] = useState(false);

  async function exportBackup() {
    if (busy) return;
    setBusy(true);
    try {
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
      await reload();
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
          'Restore this backup as your ONLY data?\n\nThis erases everything currently in the app (all sub-apps, not just your financial plan) and replaces it with the backup. Your other backup files are untouched.',
        )
      ) {
        return;
      }
      await BackupRepository.replaceAll(parsed);
      await reload();
      alert('Backup restored ✅');
    } catch (err) {
      alert(`Restore failed: ${(err as Error).message}`);
    } finally {
      if (restoreRef.current) restoreRef.current.value = '';
    }
  }

  function resetPlan() {
    if (
      !confirm(
        'Reset your financial plan to empty?\n\nThis clears all your Fortuna data (cash flow, portfolio, goals, liabilities) back to zero. It does NOT touch the rest of the app. This can’t be undone — export a backup first if unsure.',
      )
    ) {
      return;
    }
    update((d) => {
      const fresh = defaultPlan();
      d.assumptions = fresh.assumptions;
      d.cashFlow = fresh.cashFlow;
      d.assets = fresh.assets;
      d.liabilities = fresh.liabilities;
      d.goals = fresh.goals;
    });
  }

  return (
    <main className="app__body">
      <div className="page ft-page">
        <Section title="Backup & restore" subtitle="Your whole app, in one file">
          <p className="ft-note" style={{ marginTop: 0 }}>
            Export a single <strong>kaizen-backup.json</strong> with everything — your financial plan, expenses,
            notes and vault. Keep it somewhere safe (iCloud / Drive). <strong>Import</strong> merges a backup into
            what’s here; <strong>Restore</strong> wipes everything first and rebuilds from the file.
          </p>
          <div className="ft-btnrow">
            <button className="btn ft-btn" onClick={exportBackup} disabled={busy}>
              <AppIcon name="backup" size={18} /> {busy ? 'Working…' : 'Export backup'}
            </button>
            <button className="btn btn--ghost ft-btn" onClick={() => importRef.current?.click()}>
              Import
            </button>
          </div>
          <button className="btn btn--ghost btn--danger ft-btn ft-btn--full" onClick={() => restoreRef.current?.click()}>
            Restore (replace all)
          </button>
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
          <div className="ft-total" style={{ marginTop: 10 }}>
            <span>Last backup</span>
            <span className="ft-total__val">{fmtWhen(lastBackup)}</span>
          </div>
        </Section>

        <Section title="Privacy">
          <button className="btn btn--ghost ft-btn ft-btn--full" onClick={onLock}>
            <AppIcon name="vault" size={18} /> Lock financial plan
          </button>
          <p className="ft-note">
            Fortuna re-locks automatically when you switch to another app, and opens with your Vault PIN.
          </p>
        </Section>

        <Section title="About">
          <div className="ft-total" style={{ borderTop: 'none', paddingTop: 0 }}>
            <span>Version</span>
            <span className="ft-pill">v{__APP_VERSION__}</span>
          </div>
          <div className="ft-total">
            <span>Last updated</span>
            <span className="ft-total__val">{new Date(__BUILD_TIME__).toLocaleString('en-IN')}</span>
          </div>
          <p className="ft-note">
            If this date doesn’t match your latest deploy, the app is still serving a cached copy — fully close and
            reopen it twice to update.
          </p>
        </Section>

        <Section title="Danger zone">
          <button className="btn btn--ghost btn--danger ft-btn ft-btn--full" onClick={resetPlan}>
            <AppIcon name="trash" size={18} /> Reset financial plan
          </button>
          <p className="ft-note">Clears only your Fortuna data. Export a backup first if you’re unsure.</p>
        </Section>
      </div>
    </main>
  );
}
