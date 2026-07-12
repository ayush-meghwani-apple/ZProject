import { useEffect, useRef, useState } from 'react';
import { cycleName, cycleLabel } from '../core/salaryCycle';
import { currentCycleStart } from '../core/cycleDate';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import { BackupRepository } from '../repository/backupRepository';
import { getPrefs, setPrefs } from '../core/preferences';
import { saveBackupFile } from '../core/backupFile';
import { playSound } from '../core/sound';
import RecurringManager from './RecurringManager';
import PaymentMethodsManager from './PaymentMethodsManager';
import {
  ensurePersistentStorage,
  formatBytes,
  getStorageEstimate,
  isPersisted,
} from '../storage/persistence';
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

export default function Settings({ version, onChange, global = false }: Props) {
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [dateValue, setDateValue] = useState('');
  const [persisted, setPersisted] = useState(false);
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

    setPersisted(await isPersisted());
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

  async function makePersistent() {
    const ok = await ensurePersistentStorage();
    setPersisted(ok);
    if (!ok) {
      alert(
        'The browser did not grant persistent storage. Tip: install the app via Share → Add to Home Screen, which makes storage durable.',
      );
    }
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
    <div className="page">
      {!global && (
        <div className="card">
          <h3>Current Cycle</h3>
          {open ? (
            <>
              <div className="stat">{cycleName(open)}</div>
              <div className="stat--sub">{cycleLabel(open)}</div>
            </>
          ) : (
            <div className="muted">No open cycle. Set a start date below to begin tracking.</div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Data Safety</h3>
        <div className="row">
          <span>Persistent storage</span>
          <span className={persisted ? 'pill pill--good' : 'pill pill--warn'}>
            {persisted ? 'On' : 'Off'}
          </span>
        </div>
        <div className="row">
          <span>Storage used</span>
          <span className="muted">{usage}</span>
        </div>
        <div className="row">
          <span>Last backup</span>
          <span className="muted">
            {lastBackup ? new Date(lastBackup).toLocaleString('en-IN') : 'never'}
          </span>
        </div>
        {backupStale && (
          <div className="row">
            <span>Reminder</span>
            <span className="pill pill--warn">
              {backupDays === null ? 'no backup yet' : `${backupDays}d since backup`}
            </span>
          </div>
        )}
        {!persisted && (
          <button className="btn" style={{ marginTop: 12 }} onClick={makePersistent}>
            Make storage persistent
          </button>
        )}
        <div className="muted" style={{ marginTop: 12 }}>
          Expenses live only on this device. Keep storage persistent and export a
          backup regularly so an OS cleanup or reinstall can never lose data.
        </div>
      </div>

      <div className="card">
        <h3>Backup &amp; Sync</h3>
        <div className="muted" style={{ marginBottom: 12 }}>
          Export a JSON file as a safe copy, or to move data to another device.
          Import merges by record — re-importing the same file is safe.
        </div>
        <div className="inline">
          <button className="btn" onClick={exportBackup}>
            Export JSON
          </button>
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={importBackup}
          />
        </div>
        <div className="inline" style={{ marginTop: 8 }}>
          <button className="btn btn--ghost btn--danger" onClick={() => restoreRef.current?.click()}>
            Restore (replace all)
          </button>
          <input
            ref={restoreRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={restoreBackup}
          />
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          <strong>Import</strong> merges a backup into what's here. <strong>Restore</strong> wipes
          everything first and rebuilds from the backup — use it to recover a clean state (e.g. a
          messy cycle setup). Expenses are automatically filed under the cycle their date falls in.
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
        <div className="muted" style={{ marginTop: 8 }}>
          When it's been this long since your last backup, Kaizen pops up a one-tap
          reminder as soon as you open the app.
        </div>
      </div>

      {!global && (
        <>
          <div className="card">
            <h3>Set Cycle Start Date</h3>
            <div className="muted" style={{ marginBottom: 12 }}>
              Cycles start on <strong>payday — the 28th</strong>, or the Friday before if the 28th is a weekend
              (Sat → 27th, Sun → 26th). New cycles use this automatically; set a different date here for a month
              where payday shifted (e.g. a holiday). The cycle is named after the month holding the most days.
            </div>
            <div className="inline">
              <input
                className="input"
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
              />
              <button className="btn" onClick={saveStartDate}>
                Save
              </button>
            </div>
            <button
              className="btn btn--ghost"
              style={{ marginTop: 8 }}
              onClick={() => setDateValue(toDateInput(currentCycleStart().toISOString()))}
            >
              Reset to payday (28th)
            </button>
          </div>

          <div className="card">
            <h3>New Cycle</h3>
            <div className="muted" style={{ marginBottom: 12 }}>
              Starts a fresh cycle dated to this period's <strong>payday (28th)</strong> automatically. You can also
              type <strong>"start cycle"</strong> in the Add tab.
            </div>
            <button className="btn btn--ghost" onClick={startNow}>
              Start new cycle
            </button>
          </div>

          <RecurringManager version={version} onChange={onChange} />

          <PaymentMethodsManager />

          <div className="card">
            <h3>Reels Highlight</h3>
            <div className="muted" style={{ marginBottom: 12 }}>
              On the Reels page, any expense at or above this amount gets an
              attention-grabbing “big spend” look. Leave empty (or 0) to turn off.
            </div>
            <div className="inline">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="e.g. 2000"
                value={bigThreshold}
                onChange={(e) => setBigThreshold(e.target.value)}
              />
              <button
                className="btn"
                onClick={() => {
                  const n = Math.max(0, parseFloat(bigThreshold) || 0);
                  setPrefs({ bigExpenseThreshold: n });
                  setBigThreshold(String(n || ''));
                  onChange();
                }}
              >
                Save
              </button>
            </div>
          </div>

          <div className="card">
            <h3>Sounds</h3>
            <div className="muted" style={{ marginBottom: 12 }}>
              Play a little sound when you add an expense (one cue when it lands in a
              category, a different one when it doesn’t) or save a note.
            </div>
            <div className="row">
              <span>Sound effects</span>
              <button
                className={`btn${soundOn ? '' : ' btn--ghost'}`}
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
        <h3>About</h3>
        <div className="row">
          <span>Version</span>
          <span className="pill pill--good">v{__APP_VERSION__}</span>
        </div>
        <div className="row">
          <span>Last updated</span>
          <span className="muted">{new Date(__BUILD_TIME__).toLocaleString('en-IN')}</span>
        </div>
        <div className="muted" style={{ marginTop: 12 }}>
          If this date doesn't match your latest deploy, the app is still cached —
          fully close it and reopen (twice) to update.
        </div>
      </div>
    </div>
  );
}
