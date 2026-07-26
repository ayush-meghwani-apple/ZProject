import { useRef, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import { BackupRepository } from '../../repository/backupRepository';
import { PlannerRepository } from '../../repository/plannerRepository';
import { saveBackupFile } from '../../core/backupFile';
import AppIcon from '../AppIcon';
import { Section } from './shared';
import { AssumptionsContent } from './AssumptionsTab';

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

export default function SettingsTab({ plan, update, reload }: Props) {
  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(BackupRepository.getLastBackupAt());
  const [busy, setBusy] = useState(false);
  // Returns/assumptions used to be its own tab; it now lives here as a drill-in.
  const [showReturns, setShowReturns] = useState(false);

  async function exportBackup() {
    if (busy) return;
    setBusy(true);
    try {
      // Flush the latest in-memory plan to storage FIRST, so a change made
      // moments ago (before the debounced auto-save fired) is captured in the
      // backup — e.g. a just-edited SIP amount or a disabled asset category.
      await PlannerRepository.save(plan);
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

  if (showReturns) {
    return (
      <main className="app__body">
        <div className="page ft-page">
          <button className="ft-backrow" onClick={() => setShowReturns(false)}>
            <AppIcon name="back" size={18} /> Settings
          </button>
          <AssumptionsContent plan={plan} update={update} />
        </div>
      </main>
    );
  }

  return (
    <main className="app__body">
      <div className="page ft-page">
        <Section title="Planning" subtitle="Plan your investments and financial goals" icon="calendar">
          <button className="ft-navrow" onClick={() => setShowReturns(true)}>
            <span className="ft-navrow__main">
              <span className="ft-navrow__title">Returns &amp; assumptions</span>
              <span className="ft-navrow__sub">Expected returns per asset class · goal-type weights</span>
            </span>
            <AppIcon name="chevronRight" size={18} />
          </button>
        </Section>

        <Section title="Backup & restore" subtitle="Your whole app, in one file" icon="backup">
          <p className="ft-note" style={{ marginTop: 0 }}>
            Export a single <strong>kaizen-backup.json</strong> with everything — your financial plan, expenses and
            notes. Keep it somewhere safe (iCloud / Drive). <strong>Import</strong> merges a backup into
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

        <Section title="About" subtitle="Version & build info" icon="info">
          <div className="ft-total" style={{ borderTop: 'none', paddingTop: 0 }}>
            <span>Version</span>
            <span className="ft-total__val">
              <span className="ft-pill ft-pill--ok">v{__APP_VERSION__}</span>
              <span className="ft-about__built"> · {new Date(__BUILD_TIME__).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            </span>
          </div>
        </Section>
      </div>
    </main>
  );
}
