import { useEffect, useRef, useState } from 'react';
import { cycleName, cycleLabel } from '../core/salaryCycle';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import { BackupRepository } from '../repository/backupRepository';
import { getPrefs, setPrefs } from '../core/preferences';
import RecurringManager from './RecurringManager';
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

export default function Settings({ version, onChange }: Props) {
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [dateValue, setDateValue] = useState('');
  const [persisted, setPersisted] = useState(false);
  const [usage, setUsage] = useState('');
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [bigThreshold, setBigThreshold] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (!confirm('Start a new cycle from now? The current one will be closed.')) return;
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
    const backup = await BackupRepository.exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    BackupRepository.markBackedUp();
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

  return (
    <div className="page">
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
      </div>

      <div className="card">
        <h3>Set Cycle Start Date</h3>
        <div className="muted" style={{ marginBottom: 12 }}>
          The cycle is named after the month holding the most days, e.g. a cycle
          starting 24 Jun becomes <strong>Jul-26</strong>.
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
      </div>

      <div className="card">
        <h3>New Cycle</h3>
        <div className="muted" style={{ marginBottom: 12 }}>
          Start a fresh cycle from this instant. You can also type{' '}
          <strong>"start cycle"</strong> in the Add tab.
        </div>
        <button className="btn btn--ghost" onClick={startNow}>
          Start cycle now
        </button>
      </div>

      <RecurringManager version={version} onChange={onChange} />

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
