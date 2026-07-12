import { useMemo } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import { effectiveReturns } from '../../core/plannerMath';
import { Section } from './shared';
import AppIcon from '../AppIcon';

interface Props extends FortunaTabProps {
  onLock: () => void;
}

const HORIZONS = [
  { key: 'shortPct', label: 'Short', note: '< 3y' },
  { key: 'mediumPct', label: 'Medium', note: '3–6y' },
  { key: 'longPct', label: 'Long', note: '> 6y' },
] as const;

export default function AssumptionsTab({ plan, update, onLock }: Props) {
  const eff = useMemo(() => effectiveReturns(plan.assumptions), [plan.assumptions]);

  const shortSum = plan.assumptions.reduce((s, a) => s + (a.shortPct || 0), 0);
  const medSum = plan.assumptions.reduce((s, a) => s + (a.mediumPct || 0), 0);
  const longSum = plan.assumptions.reduce((s, a) => s + (a.longPct || 0), 0);

  function setField(i: number, key: 'expectedReturnPct' | 'shortPct' | 'mediumPct' | 'longPct', raw: string) {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const val = cleaned === '' ? 0 : parseFloat(cleaned) || 0;
    update((d) => {
      d.assumptions[i][key] = val;
    });
  }

  return (
    <main className="app__body">
      <div className="page ft-page">
        <p className="ft-note ft-note--top">
          Expected returns and how each goal's SIP is spread across asset classes by time horizon. These drive the
          goal SIP and target-mix calculations. Percentages are whole numbers.
        </p>

        <Section title="Effective returns" subtitle="Blended annual return used for each goal horizon">
          <div className="ft-eff">
            <div className="ft-eff__cell">
              <span className="ft-eff__k">Short</span>
              <span className="ft-eff__v">{(eff.short * 100).toFixed(1)}%</span>
            </div>
            <div className="ft-eff__cell">
              <span className="ft-eff__k">Medium</span>
              <span className="ft-eff__v">{(eff.medium * 100).toFixed(1)}%</span>
            </div>
            <div className="ft-eff__cell">
              <span className="ft-eff__k">Long</span>
              <span className="ft-eff__v">{(eff.long * 100).toFixed(1)}%</span>
            </div>
          </div>
        </Section>

        <Section title="Asset classes" subtitle="Expected return & allocation weight per horizon">
          <div className="ft-assum">
            <div className="ft-assum__head">
              <span>Asset class</span>
              <span>Return</span>
              {HORIZONS.map((h) => (
                <span key={h.key}>{h.label}</span>
              ))}
            </div>
            {plan.assumptions.map((a, i) => (
              <div className="ft-assum__row" key={a.key}>
                <span className="ft-assum__name">{a.label}</span>
                <input
                  className="input ft-assum__inp"
                  inputMode="decimal"
                  value={String(a.expectedReturnPct)}
                  onChange={(e) => setField(i, 'expectedReturnPct', e.target.value)}
                />
                {HORIZONS.map((h) => (
                  <input
                    key={h.key}
                    className="input ft-assum__inp"
                    inputMode="decimal"
                    value={String(a[h.key])}
                    onChange={(e) => setField(i, h.key, e.target.value)}
                  />
                ))}
              </div>
            ))}
            <div className="ft-assum__row ft-assum__row--sum">
              <span className="ft-assum__name">Total weight</span>
              <span />
              <span className={shortSum === 100 ? 'ft-ok' : 'ft-warn'}>{shortSum}%</span>
              <span className={medSum === 100 ? 'ft-ok' : 'ft-warn'}>{medSum}%</span>
              <span className={longSum === 100 ? 'ft-ok' : 'ft-warn'}>{longSum}%</span>
            </div>
          </div>
          <p className="ft-note">Allocation weights for each horizon should ideally add up to 100%.</p>
        </Section>

        <Section title="Privacy">
          <button className="btn btn--ghost ft-lockbtn" onClick={onLock}>
            <AppIcon name="vault" size={18} /> Lock financial plan
          </button>
        </Section>
      </div>
    </main>
  );
}
