import { useEffect, useRef, useState } from 'react';
import { cycleName, cycleLabel } from '../core/salaryCycle';
import { currentCycleStart, nextCycleStart } from '../core/cycleDate';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import { BackupRepository } from '../repository/backupRepository';
import { getPrefs, setPrefs } from '../core/preferences';
import { saveBackupFile } from '../core/backupFile';
import { playSound } from '../core/sound';
import { isDemoMode, enterDemo, exitDemo } from '../core/demoMode';
import RecurringManager from './RecurringManager';
import PaymentMethodsManager from './PaymentMethodsManager';
import AppIcon from './AppIcon';
import { ensurePersistentStorage, formatBytes, getStorageEstimate } from '../storage/persistence';
import type { SalaryCycle } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
  /** When true (shared Settings inside a sub-app), show only the cross-app
   * cards: Data Safety, Backup & Sync and About. */
  global?: boolean;
}

/** ISO string -> yyyy-mm-dd in local time, for <input type="date">. */
function toDateInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** yyyy-mm-dd (local) -> ISO at local midnight. */
function fromDateInput(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}

/** A short human date, e.g. "28 Jul 2026". */
function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Settings({ version, onChange, global = false }: Props) {
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [dateValue, setDateValue] = useState('');
  const [usage, setUsage] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [bigThreshold, setBigThreshold] = useState('');
  const [soundOn, setSoundOn] = useState(true);
  const [reminderDays, setReminderDays] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  async function load() {
    const cy = await SalaryCycleRepository.getCyclesSorted();
    setCycles(cy);
    const open = cy.find((c) => !c.endDate);
    setDateValue(toDateInput(open?.startDate));

    // Keep the browser from evicting our on-device data — best-effort, silent,
    // idempotent (granted automatically for an installed PWA).
    void ensurePersistentStorage().catch(() => {});
    const est = await getStorageEstimate();
    setUsage(est ? `${formatBytes(est.usage)} used` : 'unknown');
    setLastBackup(BackupRepository.getLastBackupAt());
    setBigThreshold(String(getPrefs().bigExpenseThreshold || ''));
    setSoundOn(getPrefs().soundEnabled);
    setReminderDays(getPrefs().backupReminderDays ?? 1);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const open = cycles.find((c) => !c.endDate);
  const backupDays = BackupRepository.daysSinceBackup();
  const backupStale = lastBackup === null || backupDays === null || backupDays >= 7;

  async function saveStartDate() {
    if (!dateValue) return;
    await SalaryCycleRepository.setOpenCycleStartDate(fromDateInput(dateValue));
    await load();
    onChange();
  }

  async function startNow() {
    if (!confirm('Start a new cycle dated to this period\u2019s payday (28th)? The current one will be closed.')) return;
    await SalaryCycleRepository.startCycle();
    await load();
    onChange();
  }

  async function exportBackup() {
    await saveBackupFile();
    setLastBackup(BackupRepository.getLastBackupAt());
    onChange();
  }

  async function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      await BackupRepository.importAll(parsed);
      await load();
      onChange();
      alert('Backup imported ✅');
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function restoreBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (
        !confirm(
          'Restore this backup as your ONLY data?\n\nThis erases everything currently in the app and replaces it with the backup — use it to recover a clean state. Your other backup files are untouched.',
        )
      ) {
        return;
      }
      await BackupRepository.replaceAll(parsed);
      await load();
      onChange();
      alert('Backup restored ✅');
    } catch (err) {
      alert(`Restore failed: ${(err as Error).message}`);
    } finally {
      if (restoreRef.current) restoreRef.current.value = '';
    }
  }

  return (
    <div className="page page--settings">
      {!global && (
        <div className="card">
          <h3>Cycle</h3>
          <p className="card__subtitle">
            Your salary period — starts on payday (the 28th, or the Friday before on a weekend).
          </p>
          {open ? (
            <div className="cyc__current">
              <span className="cyc__curlabel">
                <span className="cyc__dot" /> Current cycle
              </span>
              <span className="cyc__name">{cycleName(open)}</span>
              <span className="cyc__range">{cycleLabel(open)}</span>
            </div>
          ) : (
            <div className="muted">No open cycle yet — set a start date to begin.</div>
          )}
          <div className="row">
            <span>Next cycle</span>
            <span className="muted">{fmtDay(nextCycleStart())}</span>
          </div>
          <div className="row">
            <span>Start date</span>
            <span className="inline">
              <input
                className="input"
                type="date"
                style={{ width: 'auto' }}
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
              />
              <button className="btn btn--sm" onClick={saveStartDate}>
                Save
              </button>
            </span>
          </div>
          <div className="cyc__info">
            <AppIcon name="info" size={14} />
            <span>
              <strong>Start date</strong> only shifts the <strong>current</strong> cycle — use it for a
              month where payday moved (e.g. a holiday). New cycles still auto-start on payday.
            </span>
          </div>
          <div className="inline" style={{ marginTop: 12 }}>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setDateValue(toDateInput(currentCycleStart().toISOString()))}
            >
              <AppIcon name="recurring" size={14} /> Reset to payday
            </button>
            <button className="btn btn--ghost btn--sm" onClick={startNow}>
              <AppIcon name="plus" size={14} /> Start new cycle
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Data safety</h3>
        <div className="row">
          <span>Storage used</span>
          <span className="muted">{usage}</span>
        </div>
        <div className="row">
          <span>Last backup</span>
          {backupStale ? (
            <span className="pill pill--warn">
              {backupDays === null ? 'never' : `${backupDays}d ago`}
            </span>
          ) : (
            <span className="muted">{lastBackup ? fmtDay(new Date(lastBackup)) : 'never'}</span>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Backup &amp; sync</h3>
        <p className="card__subtitle">
          One <strong>kaizen-backup.json</strong> holds everything. <strong>Import</strong> merges;{' '}
          <strong>Restore</strong> replaces all.
        </p>
        <div className="inline">
          <button className="btn btn--sm" onClick={exportBackup}>
            Export
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <button
            className="btn btn--ghost btn--danger btn--sm"
            onClick={() => restoreRef.current?.click()}
          >
            Restore
          </button>
          <input
            ref={fileRef}
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
        <div className="row" style={{ marginTop: 12 }}>
          <span>Remind me to back up</span>
          <select
            className="input"
            style={{ width: 'auto' }}
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

      {!global && (
        <>
          <RecurringManager version={version} onChange={onChange} />

          <PaymentMethodsManager />

          <div className="card">
            <h3>Reels &amp; sounds</h3>
            <div className="row">
              <span>
                Big-spend highlight<span className="muted"> · ₹, 0 = off</span>
              </span>
              <span className="inline">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="2000"
                  style={{ width: 96 }}
                  value={bigThreshold}
                  onChange={(e) => setBigThreshold(e.target.value)}
                />
                <button
                  className="btn btn--sm"
                  onClick={() => {
                    const n = Math.max(0, parseFloat(bigThreshold) || 0);
                    setPrefs({ bigExpenseThreshold: n });
                    setBigThreshold(String(n || ''));
                    onChange();
                  }}
                >
                  Save
                </button>
              </span>
            </div>
            <div className="row">
              <span>Sound effects</span>
              <button
                className={`btn btn--sm${soundOn ? '' : ' btn--ghost'}`}
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  setPrefs({ soundEnabled: next });
                  if (next) playSound('success');
                  onChange();
                }}
              >
                {soundOn ? '🔊 On' : '🔇 Off'}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <div className="row" style={{ padding: 0 }}>
          <span>
            Demo mode<span className="muted"> · sample data, real data safe</span>
          </span>
          <button
            className={`btn btn--sm${isDemoMode() ? '' : ' btn--ghost'}`}
            onClick={() => {
              if (isDemoMode()) {
                exitDemo();
                return;
              }
              const ok = window.confirm(
                'Fill the app with DEMO sample data to show someone?\n\n' +
                  'Your real data and backups are NOT touched — turn this off any time and everything comes back exactly as it was.',
              );
              if (ok) enterDemo();
            }}
          >
            {isDemoMode() ? '✨ On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>About</h3>
        <div className="row">
          <span>Version</span>
          <span>
            <span className="pill pill--good">v{__APP_VERSION__}</span>
            <span className="muted"> · {fmtDay(new Date(__BUILD_TIME__))}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
