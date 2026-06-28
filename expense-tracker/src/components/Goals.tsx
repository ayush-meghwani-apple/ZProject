import { useEffect, useMemo, useState } from 'react';
import { GoalRepository, type NewGoalInput } from '../repository/goalRepository';
import { planItemFutureValue, projectGoal } from '../core/finance';
import { formatDuration, formatINR, newId } from '../core/util';
import {
  LUMPSUM_VEHICLES,
  RECURRING_VEHICLES,
  VEHICLES,
  vehicleIcon,
} from '../core/vehicles';
import AmountInput from './AmountInput';
import GoalTimeline from './GoalTimeline';
import type {
  Compounding,
  Goal,
  GoalPlanItem,
  PlanItemKind,
  SavingsVehicle,
} from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
}

/** Compact INR for big projected numbers, e.g. ₹12.5L / ₹1.2Cr. */
function compactINR(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return formatINR(Math.round(n));
}

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** A goal being edited in the form. Items carry ids so list edits are stable. */
interface Draft {
  name: string;
  icon: string;
  presentCost: number;
  inflationPct: number;
  years: number; // whole years
  months: number; // 0–11 extra months
  items: GoalPlanItem[];
}

const BLANK: Draft = {
  name: '',
  icon: '🎯',
  presentCost: 0,
  inflationPct: 0,
  years: 2,
  months: 0,
  items: [],
};

/** Combined fractional-year duration of a draft. */
function draftDurationYears(d: Draft): number {
  return d.years + d.months / 12;
}

function newRecurring(months: number): GoalPlanItem {
  return {
    id: newId(),
    kind: 'recurring',
    label: 'Monthly saving',
    amount: 0,
    startMonth: 0,
    durationMonths: Math.max(1, months),
    annualRatePct: 0,
    stepUpPct: 0,
    vehicle: 'bank',
  };
}

function newLumpsum(): GoalPlanItem {
  return {
    id: newId(),
    kind: 'lumpsum',
    label: 'FD',
    amount: 0,
    startMonth: 0,
    durationMonths: 12,
    annualRatePct: 7,
    compounding: 'quarterly',
    vehicle: 'fd',
  };
}

export default function Goals({ version, onChange }: Props) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setGoals(await GoalRepository.getGoals());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  function resetForm() {
    setDraft(BLANK);
    setEditingId(null);
    setShowForm(false);
  }

  function startNew() {
    const months = Math.round(draftDurationYears(BLANK) * 12);
    setDraft({ ...BLANK, items: [newRecurring(months)] });
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(g: Goal) {
    const wholeYears = Math.floor(g.years);
    const extraMonths = Math.round((g.years - wholeYears) * 12);
    setDraft({
      name: g.name,
      icon: g.icon ?? '🎯',
      presentCost: g.presentCost,
      inflationPct: g.inflationPct,
      years: wholeYears,
      months: extraMonths,
      items: g.items.map((it) => ({ ...it })),
    });
    setEditingId(g.id);
    setShowForm(true);
  }

  async function save() {
    if (!draft.name.trim()) {
      alert('Give your goal a name.');
      return;
    }
    const payload: NewGoalInput = {
      name: draft.name.trim(),
      icon: draft.icon,
      presentCost: draft.presentCost,
      inflationPct: draft.inflationPct,
      years: draftDurationYears(draft),
      items: draft.items,
    };
    if (editingId) {
      const original = goals.find((g) => g.id === editingId);
      if (original) await GoalRepository.updateGoal({ ...original, ...payload });
    } else {
      await GoalRepository.addGoal(payload);
    }
    resetForm();
    await load();
    onChange();
  }

  async function remove(id: string) {
    if (!confirm('Delete this goal?')) return;
    await GoalRepository.deleteGoal(id);
    await load();
    onChange();
  }

  function patchItem(id: string, patch: Partial<GoalPlanItem>) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  }

  function removeItem(id: string) {
    setDraft((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) }));
  }

  function addItem(kind: PlanItemKind) {
    const months = Math.round(draftDurationYears(draft) * 12);
    const item = kind === 'recurring' ? newRecurring(months) : newLumpsum();
    setDraft((d) => ({ ...d, items: [...d.items, item] }));
  }

  // Live projection of the in-progress form.
  const livePreview = useMemo(
    () =>
      projectGoal({
        id: 'draft',
        name: draft.name,
        presentCost: draft.presentCost,
        inflationPct: draft.inflationPct,
        years: draftDurationYears(draft),
        items: draft.items,
        createdAt: '',
        updatedAt: '',
      }),
    [draft],
  );

  const totalMonths = Math.max(1, Math.round(draftDurationYears(draft) * 12));

  return (
    <div className="page">
      {showForm ? (
        <div className="card">
          <h3>{editingId ? 'Edit Goal' : 'New Goal'}</h3>
          <div className="inline" style={{ marginBottom: 10 }}>
            <input
              className="input"
              style={{ width: 64, textAlign: 'center' }}
              value={draft.icon}
              onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
              aria-label="icon"
            />
            <input
              className="input"
              placeholder="Goal name, e.g. New car in 2 years"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Amount needed (₹)</label>
              <AmountInput
                value={draft.presentCost}
                onChange={(v) => setDraft({ ...draft, presentCost: v })}
              />
            </div>
            <div className="field">
              <label>Years</label>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.years || ''}
                onChange={(e) => setDraft({ ...draft, years: Math.max(0, Math.floor(num(e.target.value))) })}
              />
            </div>
            <div className="field">
              <label>Months</label>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                max={11}
                value={draft.months || ''}
                onChange={(e) =>
                  setDraft({ ...draft, months: Math.min(11, Math.max(0, Math.floor(num(e.target.value)))) })
                }
              />
            </div>
            <div className="field">
              <label>Inflation (% p.a., optional)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={draft.inflationPct || ''}
                onChange={(e) => setDraft({ ...draft, inflationPct: num(e.target.value) })}
              />
            </div>
          </div>

          <div className="plan">
            <div className="plan__head">
              <h4>Savings plan</h4>
              <span className="muted">{totalMonths} months</span>
            </div>
            <p className="card__subtitle">
              Build your real plan from blocks. Put each rupee in exactly one block (e.g. money
              that moves into an FD shouldn't also be counted as monthly savings).
            </p>

            {draft.items.length === 0 && (
              <div className="muted" style={{ margin: '8px 0' }}>
                No blocks yet — add a monthly saving or a lump sum / FD below.
              </div>
            )}

            {draft.items.map((it) => {
              const res = planItemFutureValue(it, totalMonths);
              return (
                <div className="planitem" key={it.id}>
                  <div className="planitem__top">
                    <span className={`chip chip--${it.kind}`}>
                      {vehicleIcon(it.vehicle, it.kind === 'recurring')}{' '}
                      {it.kind === 'recurring' ? 'Monthly' : 'Lump sum'}
                    </span>
                    <input
                      className="input planitem__label"
                      value={it.label}
                      onChange={(e) => patchItem(it.id, { label: e.target.value })}
                      aria-label="block label"
                    />
                    <button
                      className="iconbtn"
                      onClick={() => removeItem(it.id)}
                      title="Remove block"
                    >
                      🗑️
                    </button>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label>
                        {it.kind === 'recurring' ? 'Monthly amount (₹)' : 'Principal (₹)'}
                      </label>
                      <AmountInput
                        value={it.amount}
                        onChange={(v) => patchItem(it.id, { amount: v })}
                      />
                    </div>
                    <div className="field">
                      <label>Where does it sit?</label>
                      <select
                        className="input"
                        value={it.vehicle ?? (it.kind === 'recurring' ? 'bank' : 'fd')}
                        onChange={(e) =>
                          patchItem(it.id, { vehicle: e.target.value as SavingsVehicle })
                        }
                      >
                        {(it.kind === 'recurring' ? RECURRING_VEHICLES : LUMPSUM_VEHICLES).map(
                          (v) => (
                            <option key={v} value={v}>
                              {VEHICLES[v].icon} {VEHICLES[v].label}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                    <div className="field">
                      <label>Start (month, 0 = now)</label>
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        value={it.startMonth}
                        onChange={(e) =>
                          patchItem(it.id, { startMonth: Math.max(0, num(e.target.value)) })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>
                        {it.kind === 'recurring' ? 'Pay in for (months)' : 'Tenure (months)'}
                      </label>
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        value={it.durationMonths}
                        onChange={(e) =>
                          patchItem(it.id, { durationMonths: Math.max(1, num(e.target.value)) })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Return (% p.a.)</label>
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        value={it.annualRatePct || ''}
                        onChange={(e) => patchItem(it.id, { annualRatePct: num(e.target.value) })}
                      />
                    </div>
                    {it.kind === 'recurring' ? (
                      <div className="field">
                        <label>Yearly step-up (%)</label>
                        <input
                          className="input"
                          type="number"
                          inputMode="decimal"
                          value={it.stepUpPct || ''}
                          onChange={(e) => patchItem(it.id, { stepUpPct: num(e.target.value) })}
                        />
                      </div>
                    ) : (
                      <div className="field">
                        <label>Compounding</label>
                        <select
                          className="input"
                          value={it.compounding ?? 'quarterly'}
                          onChange={(e) =>
                            patchItem(it.id, { compounding: e.target.value as Compounding })
                          }
                        >
                          <option value="quarterly">Quarterly (FD)</option>
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                          <option value="simple">Simple</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="planitem__foot muted">
                    Grows to <strong>{compactINR(res.futureValue)}</strong> by the goal date · you
                    put in {compactINR(res.invested)}
                  </div>
                </div>
              );
            })}

            <div className="inline" style={{ marginTop: 8 }}>
              <button className="btn btn--ghost" onClick={() => addItem('recurring')}>
                ＋ Monthly saving
              </button>
              <button className="btn btn--ghost" onClick={() => addItem('lumpsum')}>
                ＋ Lump sum / FD
              </button>
            </div>
          </div>

          {/* Live projection */}
          <div className="result">
            <div className="result__row">
              <span>Target needed</span>
              <strong>{compactINR(livePreview.targetFuture)}</strong>
            </div>
            <div className="result__row result__row--hero">
              <span>Your plan reaches</span>
              <strong>{compactINR(livePreview.projectedCorpus)}</strong>
            </div>
            <div className="result__row">
              <span>{livePreview.onTrack ? 'Surplus' : 'Shortfall'}</span>
              <strong className={livePreview.onTrack ? 'pos' : 'neg'}>
                {compactINR(Math.abs(livePreview.gap))}
              </strong>
            </div>
            {!livePreview.onTrack && livePreview.extraMonthly > 0 && (
              <div className="result__row">
                <span>Save this much more / month</span>
                <strong>{compactINR(livePreview.extraMonthly)}</strong>
              </div>
            )}
          </div>

          <div className="inline" style={{ marginTop: 12 }}>
            <button className="btn" onClick={save}>
              {editingId ? 'Save' : 'Add goal'}
            </button>
            <button className="btn btn--ghost" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn" style={{ width: '100%' }} onClick={startNew}>
          ➕ New Goal
        </button>
      )}

      {goals.length === 0 && !showForm && (
        <div className="empty">No goals yet. Add one to start tracking it.</div>
      )}

      {goals.map((g) => {
        const p = projectGoal(g);
        const months = Math.max(1, Math.round(g.years * 12));
        return (
          <div className="card goal" key={g.id}>
            <div className="row" style={{ paddingTop: 0 }}>
              <div className="row__left">
                <strong>
                  {g.icon} {g.name}
                </strong>
                <span className="pill">{formatDuration(g.years)}</span>
              </div>
              <div className="inline">
                <button className="iconbtn" onClick={() => startEdit(g)} title="Edit">
                  ✏️
                </button>
                <button className="iconbtn" onClick={() => remove(g.id)} title="Delete">
                  🗑️
                </button>
              </div>
            </div>

            <div
              className={`goal__status ${p.onTrack ? 'goal__status--ok' : 'goal__status--short'}`}
            >
              {p.onTrack
                ? `On track — projected surplus of ${compactINR(Math.abs(p.gap))}`
                : `Shortfall of ${compactINR(p.gap)} — save ${compactINR(p.extraMonthly)} more/mo`}
            </div>

            <div className="goal__bar">
              <div
                className={`goal__fill ${p.onTrack ? 'goal__fill--ok' : 'goal__fill--short'}`}
                style={{ width: `${p.progressPct}%` }}
              />
            </div>

            <div className="goal__grid">
              <div className="goal__metric">
                <span className="goal__label">Needed</span>
                <span className="goal__value">{compactINR(p.targetFuture)}</span>
              </div>
              <div className="goal__metric">
                <span className="goal__label">You'll have</span>
                <span className="goal__value">{compactINR(p.projectedCorpus)}</span>
              </div>
              <div className="goal__metric">
                <span className="goal__label">You'll invest</span>
                <span className="goal__value">{compactINR(p.invested)}</span>
              </div>
              <div className="goal__metric">
                <span className="goal__label">Progress</span>
                <span className="goal__value">{Math.round(p.progressPct)}%</span>
              </div>
            </div>

            {g.items.length > 0 && (
              <div className="goal__plan">
                {g.items.map((it) => {
                  const res = planItemFutureValue(it, months);
                  return (
                    <div className="goal__block" key={it.id}>
                      <span className="goal__block-name">
                        {vehicleIcon(it.vehicle, it.kind === 'recurring')} {it.label}
                      </span>
                      <span className="muted">{compactINR(res.futureValue)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <GoalTimeline goal={g} />
          </div>
        );
      })}
    </div>
  );
}
