import { useMemo } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { HorizonDef } from '../../types/models';
import { effectiveReturns, activeAssumptions, planHorizons } from '../../core/plannerMath';
import { newId } from '../../core/util';
import AppIcon from '../AppIcon';
import { Section } from './shared';

export default function AssumptionsTab({ plan, update }: FortunaTabProps) {
  const disabled = new Set(plan.disabledClasses ?? []);
  const goalTypes = useMemo(() => planHorizons(plan.horizons), [plan.horizons]);
  const active = useMemo(
    () => activeAssumptions(plan.assumptions, plan.disabledClasses ?? []),
    [plan.assumptions, plan.disabledClasses],
  );
  const eff = useMemo(() => effectiveReturns(active, goalTypes), [active, goalTypes]);

  const weightSum = (hid: string) => active.reduce((s, a) => s + (a.weights?.[hid] || 0), 0);

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
    update((d) => {
      const hs = d.horizons ?? (d.horizons = []);
      hs.push({ id: newId(), label: 'New goal type', description: '' });
    });
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

        <Section title="Goal types" subtitle="Your own goal buckets — a name and a one-line description">
          {goalTypes.map((h) => (
            <div className="ft-gtype" key={h.id}>
              <div className="ft-gtype__main">
                <input
                  className="input ft-gtype__label"
                  value={h.label}
                  placeholder="Goal type name"
                  onChange={(e) => setGoalType(h.id, { label: e.target.value })}
                />
                <input
                  className="input ft-gtype__desc"
                  value={h.description ?? ''}
                  placeholder="One-line description"
                  onChange={(e) => setGoalType(h.id, { description: e.target.value })}
                />
              </div>
              {goalTypes.length > 1 && (
                <button
                  className="iconbtn ft-gtype__del"
                  aria-label="Remove goal type"
                  title="Remove"
                  onClick={() => removeGoalType(h.id)}
                >
                  <AppIcon name="trash" size={16} />
                </button>
              )}
            </div>
          ))}
          <button className="ft-addrow" onClick={addGoalType}>
            <AppIcon name="plus" size={16} /> Add goal type
          </button>
        </Section>

        <Section title="Asset classes" subtitle="Expected return, and each goal type's split across classes">
          {plan.assumptions.map((a, i) =>
            disabled.has(a.key) ? null : (
              <div className="ft-acls" key={a.key}>
                <div className="ft-acls__head">
                  <span className="ft-acls__name">{a.label || 'Custom'}</span>
                  <span className="ft-acls__ret">
                    <input
                      className="input ft-acls__inp"
                      inputMode="decimal"
                      value={String(a.expectedReturnPct)}
                      onChange={(e) => setReturn(i, e.target.value)}
                    />
                    <span className="ft-acls__unit">% return</span>
                  </span>
                </div>
                <div className="ft-acls__weights">
                  {goalTypes.map((h) => (
                    <label className="ft-acls__wrow" key={h.id}>
                      <span className="ft-acls__wlabel">{h.label}</span>
                      <span className="ft-acls__winput">
                        <input
                          className="input ft-acls__inp"
                          inputMode="decimal"
                          value={String(a.weights?.[h.id] ?? 0)}
                          onChange={(e) => setWeight(i, h.id, e.target.value)}
                        />
                        <span className="ft-acls__unit">%</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ),
          )}

          <div className="ft-acls__totals">
            <div className="ft-sublabel">Total weight per goal type</div>
            {goalTypes.map((h) => {
              const s = weightSum(h.id);
              return (
                <div className="ft-total" key={h.id}>
                  <span>{h.label}</span>
                  <span className={`ft-total__val ${s === 100 ? 'ft-ok' : 'ft-warn'}`}>{s}%</span>
                </div>
              );
            })}
          </div>
          <p className="ft-note">Each goal type's weights should ideally add up to 100%.</p>
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

function clean(raw: string): number {
  const c = raw.replace(/[^0-9.]/g, '');
  return c === '' ? 0 : parseFloat(c) || 0;
}
