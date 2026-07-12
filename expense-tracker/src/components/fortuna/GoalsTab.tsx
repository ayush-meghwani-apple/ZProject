import { useMemo, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { AssetClassKey, FinancialGoalRow } from '../../types/models';
import { computeGoal, horizonLabel, CLASS_LABEL, computeCashFlow } from '../../core/plannerMath';
import { newId } from '../../core/util';
import AppIcon from '../AppIcon';
import { Section, MoneyRow, PercentRow, formatINR } from './shared';

const CLASS_ORDER: AssetClassKey[] = ['domestic_equity', 'us_equity', 'debt', 'gold', 'crypto', 'real_estate'];

function newGoal(): FinancialGoalRow {
  return {
    id: newId(),
    name: '',
    priority: '',
    yearsLeft: 5,
    amountRequiredToday: 0,
    amountAvailableToday: 0,
    inflationPct: 6,
    stepUpPct: 0,
  };
}

export default function GoalsTab({ plan, update }: FortunaTabProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const totalSip = useMemo(
    () => plan.goals.reduce((s, g) => s + computeGoal(g, plan.assumptions).sipRequired, 0),
    [plan.goals, plan.assumptions],
  );
  const surplus = useMemo(() => computeCashFlow(plan.cashFlow).investingSurplus, [plan.cashFlow]);
  const overCommitted = totalSip > surplus && surplus > 0;

  function addGoal() {
    const g = newGoal();
    update((d) => { d.goals.push(g); });
    setOpenId(g.id);
  }

  return (
    <main className="app__body">
      <div className="page ft-page">
        <div className="ft-hero">
          <div className="ft-stat ft-stat--neutral">
            <span className="ft-stat__label">Total monthly SIP required</span>
            <span className="ft-stat__val">{formatINR(totalSip)}</span>
          </div>
          {surplus > 0 && (
            <div className="ft-hero__split">
              <div className="ft-hero__cell">
                <span className="ft-hero__k">Monthly surplus</span>
                <span className="ft-hero__v">{formatINR(surplus)}</span>
              </div>
              <div className="ft-hero__cell">
                <span className="ft-hero__k">{overCommitted ? 'Shortfall' : 'Spare'}</span>
                <span className={`ft-hero__v ${overCommitted ? 'ft-neg' : ''}`}>
                  {formatINR(Math.abs(surplus - totalSip))}
                </span>
              </div>
            </div>
          )}
          {overCommitted && (
            <p className="ft-warnbanner">
              ⚠️ Your goals need {formatINR(totalSip)}/mo but your investing surplus is only{' '}
              {formatINR(surplus)}/mo. Consider extending timelines, trimming targets, or raising income.
            </p>
          )}
        </div>

        {plan.goals.length === 0 && (
          <p className="ft-note ft-note--top">No goals yet. Add your first financial goal to see the SIP you need.</p>
        )}

        {plan.goals.map((g, i) => {
          const c = computeGoal(g, plan.assumptions);
          const open = openId === g.id;
          return (
            <div className={`ft-goal ${open ? 'ft-goal--open' : ''}`} key={g.id}>
              <button className="ft-goal__head" onClick={() => setOpenId(open ? null : g.id)}>
                <span className="ft-goal__title">
                  <span className="ft-goal__name">{g.name.trim() || 'Untitled goal'}</span>
                  <span className="ft-goal__meta">
                    {horizonLabel(c.horizon)} · {g.yearsLeft || 0}y
                  </span>
                </span>
                <span className="ft-goal__sip">
                  <span className="ft-goal__sipv">{formatINR(c.sipRequired)}</span>
                  <span className="ft-goal__sipk">/mo</span>
                </span>
                <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
              </button>

              {open && (
                <div className="ft-goal__body">
                  <label className="ft-row">
                    <span className="ft-row__label">Goal name</span>
                    <span className="ft-row__field">
                      <input
                        className="input ft-row__input"
                        value={g.name}
                        placeholder="e.g. Retirement, Car, House"
                        onChange={(e) => update((d) => { d.goals[i].name = e.target.value; })}
                      />
                    </span>
                  </label>
                  <label className="ft-row">
                    <span className="ft-row__label">Priority</span>
                    <span className="ft-row__field">
                      <input
                        className="input ft-row__input"
                        value={g.priority ?? ''}
                        placeholder="High / Medium / Low"
                        onChange={(e) => update((d) => { d.goals[i].priority = e.target.value; })}
                      />
                    </span>
                  </label>
                  <label className="ft-row">
                    <span className="ft-row__label">Years left for goal</span>
                    <span className="ft-row__field ft-row__field--pct">
                      <input
                        className="input ft-row__input"
                        inputMode="decimal"
                        value={String(g.yearsLeft)}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                          update((d) => { d.goals[i].yearsLeft = cleaned === '' ? 0 : parseFloat(cleaned) || 0; });
                        }}
                      />
                      <span className="ft-row__cur">yrs</span>
                    </span>
                  </label>
                  <MoneyRow
                    label="Amount required (today)"
                    value={g.amountRequiredToday}
                    onChange={(v) => update((d) => { d.goals[i].amountRequiredToday = v; })}
                  />
                  <MoneyRow
                    label="Amount available (today)"
                    value={g.amountAvailableToday}
                    onChange={(v) => update((d) => { d.goals[i].amountAvailableToday = v; })}
                  />
                  <PercentRow
                    label="Goal inflation"
                    value={g.inflationPct}
                    onChange={(v) => update((d) => { d.goals[i].inflationPct = v; })}
                  />
                  <PercentRow
                    label="Annual SIP step-up"
                    value={g.stepUpPct}
                    onChange={(v) => update((d) => { d.goals[i].stepUpPct = v; })}
                  />

                  <div className="ft-goal__calc">
                    <div className="ft-goal__calcrow">
                      <span>Horizon</span>
                      <span>
                        {horizonLabel(c.horizon)} · {(c.effReturn * 100).toFixed(1)}% return
                      </span>
                    </div>
                    <div className="ft-goal__calcrow">
                      <span>Amount required (future)</span>
                      <span>{formatINR(c.amountRequiredFuture)}</span>
                    </div>
                    <div className="ft-goal__calcrow ft-goal__calcrow--strong">
                      <span>SIP required</span>
                      <span>{formatINR(c.sipRequired)}/mo</span>
                    </div>
                  </div>

                  {c.sipRequired > 0 && (
                    <div className="ft-goal__alloc">
                      <div className="ft-sublabel">Monthly split across asset classes</div>
                      {CLASS_ORDER.filter((k) => c.allocations[k] > 0).map((k) => (
                        <div className="ft-goal__allocrow" key={k}>
                          <span>{CLASS_LABEL[k]}</span>
                          <span>{formatINR(c.allocations[k])}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    className="btn btn--danger ft-goal__del"
                    onClick={() => {
                      update((d) => { d.goals.splice(i, 1); });
                      setOpenId(null);
                    }}
                  >
                    <AppIcon name="trash" size={16} /> Delete goal
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button className="btn ft-addgoal" onClick={addGoal}>
          <AppIcon name="plus" size={18} /> Add goal
        </button>

        <Section title="How this works">
          <p className="ft-note">
            Each goal's future cost is your required amount grown by inflation, minus what you've already set aside
            grown at the expected return for its time horizon. The SIP is the monthly amount that reaches that
            shortfall by the goal date, then split across asset classes using your Assumptions.
          </p>
        </Section>
      </div>
    </main>
  );
}
