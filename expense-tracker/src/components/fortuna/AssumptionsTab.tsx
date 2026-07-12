import { useMemo } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { HorizonDef } from '../../types/models';
import { effectiveReturns, activeAssumptions, planHorizons } from '../../core/plannerMath';
import { newId } from '../../core/util';
import AppIcon from '../AppIcon';
import { Section } from './shared';

const BUILT_IN_HORIZONS = new Set(['short', 'medium', 'long']);

export default function AssumptionsTab({ plan, update }: FortunaTabProps) {
  const disabled = new Set(plan.disabledClasses ?? []);
  const horizons = useMemo(
    () => [...planHorizons(plan.horizons)].sort((a, b) => a.maxYears - b.maxYears),
    [plan.horizons],
  );
  const active = useMemo(
    () => activeAssumptions(plan.assumptions, plan.disabledClasses ?? []),
    [plan.assumptions, plan.disabledClasses],
  );
  const eff = useMemo(() => effectiveReturns(active, horizons), [active, horizons]);

  const weightSum = (hid: string) => active.reduce((s, a) => s + (a.weights?.[hid] || 0), 0);

  // Grid: name | return | one column per horizon.
  const cols = `minmax(96px, 1.4fr) 64px ${horizons.map(() => '1fr').join(' ')}`;

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

  function addHorizon() {
    const maxYears = Math.max(10, ...horizons.map((h) => (h.maxYears >= 999 ? 0 : h.maxYears)) ) + 5;
    update((d) => {
      const hs = d.horizons ?? (d.horizons = []);
      hs.push({ id: newId(), label: 'New', maxYears });
    });
  }
  function setHorizon(id: string, patch: Partial<HorizonDef>) {
    update((d) => {
      const h = (d.horizons ?? []).find((x) => x.id === id);
      if (h) Object.assign(h, patch);
    });
  }
  function removeHorizon(id: string) {
    update((d) => {
      d.horizons = (d.horizons ?? []).filter((h) => h.id !== id);
      for (const a of d.assumptions) if (a.weights) delete a.weights[id];
    });
  }

  return (
    <main className="app__body">
      <div className="page ft-page">
        <p className="ft-note ft-note--top">
          Expected returns and how each goal's SIP is spread across asset classes by time horizon. These drive the
          goal SIP and target-mix calculations. Percentages are whole numbers. Add your own horizon if Short / Medium /
          Long aren't enough.
        </p>

        <Section title="Effective returns" subtitle="Blended annual return used for each goal horizon">
          <div className="ft-eff">
            {horizons.map((h) => (
              <div className="ft-eff__cell" key={h.id}>
                <span className="ft-eff__k">{h.label}</span>
                <span className="ft-eff__v">{((eff[h.id] ?? 0) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Time horizons" subtitle="A goal falls in the first horizon its years-left is under">
          {horizons.map((h) => (
            <div className="ft-hzrow" key={h.id}>
              <input
                className="input ft-hzrow__label"
                value={h.label}
                onChange={(e) => setHorizon(h.id, { label: e.target.value })}
              />
              <span className="ft-hzrow__upto">
                {h.maxYears >= 999 ? (
                  <span className="ft-hzrow__catchall">longest</span>
                ) : (
                  <>
                    <span>&lt;</span>
                    <input
                      className="input ft-hzrow__years"
                      inputMode="decimal"
                      value={String(h.maxYears)}
                      onChange={(e) => setHorizon(h.id, { maxYears: clean(e.target.value) })}
                    />
                    <span>yrs</span>
                  </>
                )}
              </span>
              {BUILT_IN_HORIZONS.has(h.id) ? (
                <span className="ft-hzrow__lock" title="Built-in horizon">
                  fixed
                </span>
              ) : (
                <button className="iconbtn" aria-label="Remove horizon" title="Remove" onClick={() => removeHorizon(h.id)}>
                  <AppIcon name="trash" size={15} />
                </button>
              )}
            </div>
          ))}
          <button className="ft-addrow" onClick={addHorizon}>
            <AppIcon name="plus" size={16} /> Add horizon
          </button>
        </Section>

        <Section title="Asset classes" subtitle="Expected return & allocation weight per horizon">
          <div className="ft-assum ft-assum--scroll">
            <div className="ft-assum__grid" style={{ gridTemplateColumns: cols }}>
              <div className="ft-assum__head" style={{ display: 'contents' }}>
                <span>Asset class</span>
                <span>Return</span>
                {horizons.map((h) => (
                  <span key={h.id}>{h.label}</span>
                ))}
              </div>
              {plan.assumptions.map((a, i) =>
                disabled.has(a.key) ? null : (
                  <div className="ft-assum__row" style={{ display: 'contents' }} key={a.key}>
                    <span className="ft-assum__name">{a.label || 'Custom'}</span>
                    <input
                      className="input ft-assum__inp"
                      inputMode="decimal"
                      value={String(a.expectedReturnPct)}
                      onChange={(e) => setReturn(i, e.target.value)}
                    />
                    {horizons.map((h) => (
                      <input
                        key={h.id}
                        className="input ft-assum__inp"
                        inputMode="decimal"
                        value={String(a.weights?.[h.id] ?? 0)}
                        onChange={(e) => setWeight(i, h.id, e.target.value)}
                      />
                    ))}
                  </div>
                ),
              )}
              <div className="ft-assum__row ft-assum__row--sum" style={{ display: 'contents' }}>
                <span className="ft-assum__name">Total weight</span>
                <span />
                {horizons.map((h) => {
                  const s = weightSum(h.id);
                  return (
                    <span key={h.id} className={s === 100 ? 'ft-ok' : 'ft-warn'}>
                      {s}%
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="ft-note">Allocation weights for each horizon should ideally add up to 100%.</p>
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
