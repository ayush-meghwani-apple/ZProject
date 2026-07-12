import { Fragment, useMemo, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { HorizonDef } from '../../types/models';
import { effectiveReturns, activeAssumptions, planHorizons } from '../../core/plannerMath';
import { newId } from '../../core/util';
import AppIcon from '../AppIcon';
import { Section } from './shared';

/** Short column headers for the asset-class matrix, so the 6 classes fit the
 *  screen width without horizontal scrolling. */
const SHORT_CLASS: Record<string, string> = {
  domestic_equity: 'Dom. Eq',
  us_equity: 'US Eq',
  debt: 'Debt',
  gold: 'Gold',
  crypto: 'Crypto',
  real_estate: 'RE',
};

export default function AssumptionsTab({ plan, update }: FortunaTabProps) {
  const disabled = new Set(plan.disabledClasses ?? []);
  const [newTypeId, setNewTypeId] = useState<string | null>(null);
  const goalTypes = useMemo(() => planHorizons(plan.horizons), [plan.horizons]);
  const active = useMemo(
    () => activeAssumptions(plan.assumptions, plan.disabledClasses ?? []),
    [plan.assumptions, plan.disabledClasses],
  );
  const activeWithIndex = useMemo(
    () => plan.assumptions.map((a, i) => ({ a, i })).filter((x) => !disabled.has(x.a.key)),
    [plan.assumptions, plan.disabledClasses],
  );
  const eff = useMemo(() => effectiveReturns(active, goalTypes), [active, goalTypes]);

  const weightSum = (hid: string) => active.reduce((s, a) => s + (a.weights?.[hid] || 0), 0);
  const shortClass = (label: string, key: string) =>
    SHORT_CLASS[key] ?? (label.length > 8 ? `${label.slice(0, 7)}…` : label || 'Custom');

  function setReturn(i: number, raw: string) {
    const val = clean(raw);
    update((d) => { d.assumptions[i].expectedReturnPct = val; });
  }
  function setWeight(i: number, hid: string, raw: string) {
    const val = clean(raw);
    update((d) => {
      const w = d.assumptions[i].weights ?? (d.assumptions[i].weights = {});
      w[hid] = val;
    });
  }

  function addGoalType() {
    const id = newId();
    update((d) => {
      const hs = d.horizons ?? (d.horizons = []);
      hs.push({ id, label: 'New goal type', description: '' });
    });
    setNewTypeId(id);
  }
  function setGoalType(id: string, patch: Partial<HorizonDef>) {
    update((d) => {
      const h = (d.horizons ?? []).find((x) => x.id === id);
      if (h) Object.assign(h, patch);
    });
  }
  function removeGoalType(id: string) {
    update((d) => {
      const hs = d.horizons ?? [];
      if (hs.length <= 1) return; // always keep at least one type
      d.horizons = hs.filter((h) => h.id !== id);
      for (const a of d.assumptions) if (a.weights) delete a.weights[id];
    });
  }

  // Matrix grid: a goal-type-label column + one column per (enabled) asset class.
  const cols = `minmax(60px, 86px) repeat(${activeWithIndex.length}, minmax(0, 1fr))`;

  return (
    <main className="app__body">
      <div className="page ft-page">
        <p className="ft-note ft-note--top">
          Define your own goal types, then set each asset class's expected return and how much of each type's SIP goes
          into it. These drive the goal SIP and target-mix calculations. Percentages are whole numbers.
        </p>

        <Section title="Effective returns" subtitle="Blended annual return used for each goal type">
          <div className="ft-eff">
            {goalTypes.map((h) => (
              <div className="ft-eff__cell" key={h.id}>
                <span className="ft-eff__k">{h.label}</span>
                <span className="ft-eff__v">{((eff[h.id] ?? 0) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Goal types" subtitle="Your own goal buckets — tap a row to rename or edit it">
          {goalTypes.map((h) => (
            <GoalTypeRow
              key={h.id}
              def={h}
              canDelete={goalTypes.length > 1}
              startEditing={h.id === newTypeId}
              onChange={(patch) => setGoalType(h.id, patch)}
              onRemove={() => removeGoalType(h.id)}
            />
          ))}
          <button className="ft-addrow" onClick={addGoalType}>
            <AppIcon name="plus" size={16} /> Add goal type
          </button>
        </Section>

        <Section title="Asset classes" subtitle="Rows are goal types; columns are your asset classes">
          <div className="ft-mx" style={{ gridTemplateColumns: cols }}>
            <div className="ft-mx__corner" />
            {activeWithIndex.map(({ a }) => (
              <div className="ft-mx__ch" key={a.key} title={a.label}>
                {shortClass(a.label, a.key)}
              </div>
            ))}

            <div className="ft-mx__rh">
              <span className="ft-mx__rhname">Return</span>
              <span className="ft-mx__rhsub">% p.a.</span>
            </div>
            {activeWithIndex.map(({ a, i }) => (
              <span className="ft-mx__cell" key={a.key}>
                <input
                  className="input ft-mx__inp"
                  inputMode="decimal"
                  value={String(a.expectedReturnPct)}
                  onChange={(e) => setReturn(i, e.target.value)}
                />
              </span>
            ))}

            {goalTypes.map((h) => {
              const s = weightSum(h.id);
              return (
                <Fragment key={h.id}>
                  <div className="ft-mx__rh">
                    <span className="ft-mx__rhname">{h.label}</span>
                    <span className={`ft-mx__rhsum ${s === 100 ? 'ft-ok' : 'ft-warn'}`}>{s}%</span>
                  </div>
                  {activeWithIndex.map(({ a, i }) => (
                    <span className="ft-mx__cell" key={a.key}>
                      <input
                        className="input ft-mx__inp"
                        inputMode="decimal"
                        value={String(a.weights?.[h.id] ?? 0)}
                        onChange={(e) => setWeight(i, h.id, e.target.value)}
                      />
                    </span>
                  ))}
                </Fragment>
              );
            })}
          </div>
          <p className="ft-note">Each goal type's weights (its row) should ideally add up to 100%.</p>
          {disabled.size > 0 && (
            <p className="ft-note">
              {disabled.size} category{disabled.size > 1 ? 'ies' : ''} disabled — hidden here and excluded from the
              effective returns and goal allocations. Re-enable from the Portfolio tab.
            </p>
          )}
        </Section>
      </div>
    </main>
  );
}

/** A goal type shown as a clean tappable read row (name + description + ›);
 *  tapping opens an inline editor (name / description / delete). */
function GoalTypeRow({
  def,
  canDelete,
  startEditing = false,
  onChange,
  onRemove,
}: {
  def: HorizonDef;
  canDelete: boolean;
  startEditing?: boolean;
  onChange: (patch: Partial<HorizonDef>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);

  if (editing) {
    return (
      <div className="ft-gtype">
        <div className="ft-gtype__main">
          <input
            className="input ft-gtype__label"
            value={def.label}
            autoFocus
            placeholder="Goal type name"
            onChange={(e) => onChange({ label: e.target.value })}
          />
          <input
            className="input ft-gtype__desc"
            value={def.description ?? ''}
            placeholder="One-line description"
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </div>
        {canDelete && (
          <button
            className="iconbtn ft-gtype__del"
            aria-label="Remove goal type"
            title="Remove"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRemove}
          >
            <AppIcon name="trash" size={16} />
          </button>
        )}
        <button
          className="iconbtn ft-gtype__done"
          aria-label="Done"
          title="Done"
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing(false)}
        >
          <AppIcon name="done" size={16} />
        </button>
      </div>
    );
  }

  return (
    <button className="ft-readrow ft-readrow--tap ft-gtype__read" onClick={() => setEditing(true)}>
      <span className="ft-gtype__readmain">
        <span className="ft-gtype__readname">{def.label.trim() || 'Untitled goal type'}</span>
        {def.description && <span className="ft-gtype__readdesc">{def.description}</span>}
      </span>
      <AppIcon name="chevronRight" size={15} className="ft-readrow__chev" />
    </button>
  );
}

function clean(raw: string): number {
  const c = raw.replace(/[^0-9.]/g, '');
  return c === '' ? 0 : parseFloat(c) || 0;
}
