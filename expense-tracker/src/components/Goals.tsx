import { useEffect, useState } from 'react';
import { GoalRepository, type NewGoalInput } from '../repository/goalRepository';
import { projectGoal, stepUpSipFutureValue } from '../core/finance';
import { formatINR } from '../core/util';
import type { Goal } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
}

const BLANK: NewGoalInput = {
  name: '',
  icon: '🎯',
  presentCost: 0,
  inflationPct: 6,
  years: 5,
  currentSavings: 0,
  monthlySaving: 0,
  stepUpPct: 10,
  expectedReturnPct: 12,
};

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

export default function Goals({ version, onChange }: Props) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [form, setForm] = useState<NewGoalInput>(BLANK);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Stand-alone step-up SIP calculator (not saved).
  const [calc, setCalc] = useState({ monthly: 10000, stepUp: 10, years: 2, returnPct: 12 });

  async function load() {
    setGoals(await GoalRepository.getGoals());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  function resetForm() {
    setForm(BLANK);
    setEditingId(null);
    setShowForm(false);
  }

  async function save() {
    if (!form.name.trim()) {
      alert('Give your goal a name.');
      return;
    }
    if (editingId) {
      const original = goals.find((g) => g.id === editingId);
      if (original) await GoalRepository.updateGoal({ ...original, ...form });
    } else {
      await GoalRepository.addGoal(form);
    }
    resetForm();
    await load();
    onChange();
  }

  function startEdit(g: Goal) {
    setForm({
      name: g.name,
      icon: g.icon ?? '🎯',
      presentCost: g.presentCost,
      inflationPct: g.inflationPct,
      years: g.years,
      currentSavings: g.currentSavings,
      monthlySaving: g.monthlySaving,
      stepUpPct: g.stepUpPct,
      expectedReturnPct: g.expectedReturnPct,
    });
    setEditingId(g.id);
    setShowForm(true);
  }

  async function remove(id: string) {
    if (!confirm('Delete this goal?')) return;
    await GoalRepository.deleteGoal(id);
    await load();
    onChange();
  }

  const calcResult = stepUpSipFutureValue(calc.monthly, calc.returnPct, calc.stepUp, calc.years);

  return (
    <div className="page">
      {/* Quick step-up SIP calculator */}
      <div className="card">
        <h3>Step-up SIP Calculator</h3>
        <p className="card__subtitle">
          See what a monthly investment grows to with a yearly step-up — nothing saved, just a quick
          what-if.
        </p>
        <div className="field">
          <label>Monthly investment (₹)</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={calc.monthly}
            onChange={(e) => setCalc({ ...calc, monthly: num(e.target.value) })}
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Yearly step-up (%)</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={calc.stepUp}
              onChange={(e) => setCalc({ ...calc, stepUp: num(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Years</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={calc.years}
              onChange={(e) => setCalc({ ...calc, years: num(e.target.value) })}
            />
          </div>
        </div>
        <div className="field">
          <label>Expected return (% p.a.)</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={calc.returnPct}
            onChange={(e) => setCalc({ ...calc, returnPct: num(e.target.value) })}
          />
        </div>
        <div className="result">
          <div className="result__row">
            <span>You invest</span>
            <strong>{compactINR(calcResult.invested)}</strong>
          </div>
          <div className="result__row result__row--hero">
            <span>Projected value</span>
            <strong>{compactINR(calcResult.futureValue)}</strong>
          </div>
          <div className="result__row">
            <span>Estimated gain</span>
            <strong className="pos">
              {compactINR(calcResult.futureValue - calcResult.invested)}
            </strong>
          </div>
        </div>
      </div>

      {/* Add / edit a goal */}
      {showForm ? (
        <div className="card">
          <h3>{editingId ? 'Edit Goal' : 'New Goal'}</h3>
          <div className="inline" style={{ marginBottom: 10 }}>
            <input
              className="input"
              style={{ width: 64, textAlign: 'center' }}
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              aria-label="icon"
            />
            <input
              className="input"
              placeholder="Goal name, e.g. Child's education"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Cost today (₹)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={form.presentCost || ''}
                onChange={(e) => setForm({ ...form, presentCost: num(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Need in (years)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={form.years || ''}
                onChange={(e) => setForm({ ...form, years: num(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Inflation (% p.a.)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={form.inflationPct || ''}
                onChange={(e) => setForm({ ...form, inflationPct: num(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Expected return (% p.a.)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={form.expectedReturnPct || ''}
                onChange={(e) => setForm({ ...form, expectedReturnPct: num(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Saved so far (₹)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={form.currentSavings || ''}
                onChange={(e) => setForm({ ...form, currentSavings: num(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Monthly saving (₹)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={form.monthlySaving || ''}
                onChange={(e) => setForm({ ...form, monthlySaving: num(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Yearly step-up (%)</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={form.stepUpPct || ''}
                onChange={(e) => setForm({ ...form, stepUpPct: num(e.target.value) })}
              />
            </div>
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
        <button className="btn" style={{ width: '100%' }} onClick={() => setShowForm(true)}>
          ➕ New Goal
        </button>
      )}

      {/* Goal list */}
      {goals.length === 0 && !showForm && (
        <div className="empty">No goals yet. Add one to start tracking it.</div>
      )}

      {goals.map((g) => {
        const p = projectGoal(g);
        return (
          <div className="card goal" key={g.id}>
            <div className="row" style={{ paddingTop: 0 }}>
              <div className="row__left">
                <strong>
                  {g.icon} {g.name}
                </strong>
                <span className="pill">{g.years}y</span>
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

            <div className={`goal__status ${p.onTrack ? 'goal__status--ok' : 'goal__status--short'}`}>
              {p.onTrack
                ? `On track — projected surplus of ${compactINR(Math.abs(p.gap))}`
                : `Shortfall of ${compactINR(p.gap)} — consider saving ${compactINR(
                    p.requiredMonthly,
                  )}/mo`}
            </div>

            <div className="goal__bar">
              <div
                className={`goal__fill ${p.onTrack ? 'goal__fill--ok' : 'goal__fill--short'}`}
                style={{ width: `${p.progressPct}%` }}
              />
            </div>

            <div className="goal__grid">
              <div className="goal__metric">
                <span className="goal__label">Needed today</span>
                <span className="goal__value">{compactINR(p.targetToday)}</span>
              </div>
              <div className="goal__metric">
                <span className="goal__label">Needed in {g.years}y</span>
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
            </div>

            <div className="goal__plan muted">
              {formatINR(g.monthlySaving)}/mo
              {g.stepUpPct ? ` · +${g.stepUpPct}% yearly step-up` : ''} · {g.expectedReturnPct}%
              return · {g.inflationPct}% inflation
            </div>
          </div>
        );
      })}
    </div>
  );
}
