import { useEffect, useState } from 'react';
import { cycleLabel, cycleBig } from '../core/salaryCycle';
import { currentCycleStart, nextCycleStart } from '../core/cycleDate';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import { getPrefs, setPrefs } from '../core/preferences';
import { playSound } from '../core/sound';
import { isDemoMode, enterDemo, exitDemo } from '../core/demoMode';
import RecurringManager from './RecurringManager';
import PaymentMethodsManager from './PaymentMethodsManager';
import DataBackupCard from './DataBackupCard';
import AppIcon from './AppIcon';
import type { SalaryCycle } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
  /** When true (shared Settings inside a sub-app), show only the cross-app
   * cards: Data & Backup and About. */
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

/** A concrete date span, e.g. "26 Jul – 25 Aug 2026" (year dropped on the
 *  start when both ends share it). */
function fmtSpan(a: Date, b: Date): string {
  const sameYear = a.getFullYear() === b.getFullYear();
  const aStr = a.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const bStr = b.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${aStr} – ${bStr}`;
}

/** Full date + time, e.g. "25 Jul 2026, 2:34 pm" — used for the build stamp. */
function fmtDayTime(d: Date): string {
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Settings({ version, onChange, global = false }: Props) {
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [cycleOpen, setCycleOpen] = useState(true);
  const [editing, setEditing] = useState<null | 'current' | 'next'>(null);
  const [editDate, setEditDate] = useState('');
  const [bigThreshold, setBigThreshold] = useState('');
  const [soundOn, setSoundOn] = useState(true);

  async function load() {
    const cy = await SalaryCycleRepository.getCyclesSorted();
    setCycles(cy);
    setBigThreshold(String(getPrefs().bigExpenseThreshold || ''));
    setSoundOn(getPrefs().soundEnabled);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const open = cycles.find((c) => !c.endDate);

  // The next cycle: the user's edited date if they set one, else the payday.
  const overrideISO = getPrefs().nextCycleStartOverride;
  const nextStartDate = overrideISO ? new Date(overrideISO) : nextCycleStart();
  // The payday after the next start marks where the next cycle ends; show the
  // range up to the day before it (e.g. "26 Jul – 25 Aug").
  const nextEndBoundary = nextCycleStart(new Date(nextStartDate.getTime() + 86400000));
  const nextEndDisplay = new Date(nextEndBoundary.getTime() - 86400000);
  const nextCycleLabel = cycleBig({
    startDate: nextStartDate.toISOString(),
    endDate: nextEndBoundary.toISOString(),
  } as SalaryCycle);

  function startEdit(which: 'current' | 'next') {
    setEditing(which);
    setEditDate(
      which === 'current' ? toDateInput(open?.startDate) : toDateInput(nextStartDate.toISOString()),
    );
  }

  function resetEditToPayday() {
    setEditDate(
      toDateInput((editing === 'current' ? currentCycleStart() : nextCycleStart()).toISOString()),
    );
  }

  async function saveEdit() {
    if (!editDate) return;
    if (editing === 'current') {
      await SalaryCycleRepository.setOpenCycleStartDate(fromDateInput(editDate));
    } else if (editing === 'next') {
      // Storing the computed payday would be pointless — clear the override so
      // the cycle keeps auto-tracking payday; otherwise remember the edit.
      const payday = toDateInput(nextCycleStart().toISOString());
      setPrefs({
        nextCycleStartOverride: editDate === payday ? undefined : fromDateInput(editDate),
      });
    }
    setEditing(null);
    await load();
    onChange();
  }

  return (
    <div className="page page--settings">
      <DataBackupCard onReload={load} />

      {!global && (
        <div className="card">
          <button className="scard__head" onClick={() => setCycleOpen((o) => !o)}>
            <span className="scard__icon">
              <AppIcon name="calendar" size={22} />
            </span>
            <span className="scard__headtext">
              <span className="scard__title">Cycle</span>
              <span className="scard__sub">Your salary period and cycle dates</span>
            </span>
            <AppIcon name={cycleOpen ? 'chevronUp' : 'chevronDown'} size={18} />
          </button>

          {cycleOpen && (
            <div className="cycrows">
              {open ? (
                <div className="cycrow">
                  <span className="cycrow__tag">
                    <span className="cycrow__dot cycrow__dot--now" /> Current
                  </span>
                  <span className="cycrow__mid">
                    <span className="cycrow__big">{cycleBig(open)}</span>
                    <span className="cycrow__range">{cycleLabel(open)}</span>
                  </span>
                  <button className="cycrow__edit" onClick={() => startEdit('current')}>
                    <AppIcon name="edit" size={15} /> Edit
                  </button>
                </div>
              ) : (
                <div className="cycrow">
                  <span className="muted">No open cycle yet.</span>
                  <button className="cycrow__edit" onClick={() => startEdit('current')}>
                    <AppIcon name="edit" size={15} /> Set
                  </button>
                </div>
              )}

              <div className="cycrow">
                <span className="cycrow__tag">
                  <span className="cycrow__dot cycrow__dot--next" /> Next
                </span>
                <span className="cycrow__mid">
                  <span className="cycrow__big">{nextCycleLabel}</span>
                  <span className="cycrow__range">{fmtSpan(nextStartDate, nextEndDisplay)}</span>
                </span>
                <button className="cycrow__edit" onClick={() => startEdit('next')}>
                  <AppIcon name="edit" size={15} /> Edit
                </button>
              </div>

              {editing && (
                <div className="cycedit">
                  <span className="cycedit__label">
                    {editing === 'current' ? 'Current cycle starts' : 'Next cycle starts'}
                  </span>
                  <span className="inline">
                    <input
                      className="input"
                      type="date"
                      style={{ width: 'auto' }}
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                    <button className="btn btn--sm" onClick={saveEdit}>
                      Save
                    </button>
                    <button className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </span>
                  <button className="cycedit__reset" onClick={resetEditToPayday}>
                    <AppIcon name="recurring" size={13} /> Reset to payday (28th)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
            <span className="muted"> · {fmtDayTime(new Date(__BUILD_TIME__))}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
