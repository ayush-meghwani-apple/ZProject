import { useMemo, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { FinancialGoalRow, GoalPriority } from '../../types/models';
import { GOAL_PRIORITIES } from '../../types/models';
import { computeGoal, horizonLabel, classLabelMap, computeCashFlow, activeAssumptions, sipAccumulated } from '../../core/plannerMath';
import { newId, addMonths, formatMonthYear } from '../../core/util';
import AppIcon, { type IconName } from '../AppIcon';
import { Section, MoneyRow, PercentRow, formatINR } from './shared';

/** Pick a fitting glyph for a goal from its name (falls back to a target). */
function goalIcon(name: string): IconName {
  const n = name.toLowerCase();
  if (/emergenc|contingen|rainy/.test(n)) return 'backup';
  if (/retire|pension|\bfire\b/.test(n)) return 'expensify';
  if (/marriage|wedding|shaadi|shadi/.test(n)) return 'family';
  if (/child|kid|educat|college|school|study|tuition|degree/.test(n)) return 'education';
  if (/\bcar\b|bike|vehicle|scooter|motor/.test(n)) return 'car';
  if (/home|house|flat|apartment|property|plot/.test(n)) return 'home';
  if (/vacation|travel|trip|holiday|tour|europe|abroad/.test(n)) return 'travel';
  if (/phone|laptop|gadget|electron|watch|iphone/.test(n)) return 'investments';
  return 'goals';
}

/** Compact INR for goal projections, e.g. ₹12.5L / ₹1.2Cr. */
function compactINR(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return formatINR(Math.round(n));
}

function newGoal(): FinancialGoalRow {
  return {
    id: newId(),
    name: '',
    priority: 'Medium',
    yearsLeft: 5,
    amountRequiredToday: 0,
    amountAvailableToday: 0,
    inflationPct: 6,
    stepUpPct: 0,
  };
}

export default function GoalsTab({ plan, update }: FortunaTabProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const assumptions = activeAssumptions(plan.assumptions, plan.disabledClasses ?? []);
  const horizons = plan.horizons;
  const goalTypes = plan.horizons ?? [];
  const labelMap = useMemo(() => classLabelMap(assumptions), [assumptions]);

  const totalSip = useMemo(
    () => plan.goals.reduce((s, g) => s + computeGoal(g, assumptions, horizons).sipRequired, 0),
    [plan.goals, assumptions, horizons],
  );
  const surplus = useMemo(() => computeCashFlow(plan.cashFlow).investingSurplus, [plan.cashFlow]);
  const overCommitted = totalSip > surplus && surplus > 0;

  function addGoal() {
    const g = newGoal();
    g.goalTypeId = plan.horizons?.[0]?.id;
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
                <span className="ft-hero__k"><span className="ft-hero__ki"><AppIcon name="calendar" size={12} /></span> Monthly surplus</span>
                <span className="ft-hero__v">{formatINR(surplus)}</span>
              </div>
              <div className="ft-hero__cell">
                <span className="ft-hero__k"><span className="ft-hero__ki"><AppIcon name="goals" size={12} /></span> {overCommitted ? 'Shortfall' : 'Spare'}</span>
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
          const c = computeGoal(g, assumptions, horizons);
          const open = openId === g.id;
          const months = Math.max(1, Math.round((g.yearsLeft || 0) * 12));
          const futureCost = (g.amountRequiredToday || 0) * Math.pow(1 + (g.inflationPct || 0) / 100, g.yearsLeft || 0);
          const fundedPct =
            g.amountRequiredToday > 0
              ? Math.max(0, Math.min(100, (g.amountAvailableToday / g.amountRequiredToday) * 100))
              : g.amountAvailableToday > 0
                ? 100
                : 0;
          return (
            <div className={`ft-goal ${open ? 'ft-goal--open' : ''}`} key={g.id}>
              <button className="ft-goal__head" onClick={() => setOpenId(open ? null : g.id)}>
                <span className="ft-goal__icon"><AppIcon name={goalIcon(g.name)} size={18} /></span>
                <span className="ft-goal__title">
                  <span className="ft-goal__name">{g.name.trim() || 'Untitled goal'}</span>
                  <span className="ft-goal__meta">
                    {horizonLabel(c.horizon, horizons)} · {g.yearsLeft || 0}y
                  </span>
                </span>
                <span className="ft-goal__sip">
                  <span className="ft-goal__sipv">{formatINR(c.sipRequired)}</span>
                  <span className="ft-goal__sipk">/mo</span>
                </span>
                <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
              </button>

              <div className="ft-goal__track">
                <div className="ft-goal__trackbar">
                  <span className="ft-goal__trackfill" style={{ width: `${fundedPct}%` }} />
                </div>
                <div className="ft-goal__trackmeta">
                  <span>{compactINR(g.amountAvailableToday || 0)} of {compactINR(g.amountRequiredToday || 0)} saved</span>
                  <span>{Math.round(fundedPct)}%</span>
                </div>
              </div>

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
                      <select
                        className="input ft-row__input"
                        value={g.priority ?? 'Medium'}
                        onChange={(e) => update((d) => { d.goals[i].priority = e.target.value as GoalPriority; })}
                      >
                        {GOAL_PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <label className="ft-row">
                    <span className="ft-row__label">Goal type</span>
                    <span className="ft-row__field">
                      <select
                        className="input ft-row__input"
                        value={g.goalTypeId ?? goalTypes[0]?.id ?? ''}
                        onChange={(e) => update((d) => { d.goals[i].goalTypeId = e.target.value; })}
                      >
                        {goalTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
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
                      <span>Goal type</span>
                      <span>
                        {horizonLabel(c.horizon, horizons)} · {(c.effReturn * 100).toFixed(1)}% return
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
                      {Object.keys(c.allocations)
                        .filter((k) => c.allocations[k] > 0)
                        .map((k) => (
                          <div className="ft-goal__allocrow" key={k}>
                            <span>{labelMap[k] ?? k}</span>
                            <span>{formatINR(c.allocations[k])}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {c.sipRequired > 0 && futureCost > 0 && (
                    <GoalTimelineFt
                      available={g.amountAvailableToday || 0}
                      sip={c.sipRequired}
                      eff={c.effReturn}
                      stepUp={g.stepUpPct || 0}
                      months={months}
                      target={futureCost}
                    />
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
            grown at the expected return for its goal type. The SIP is the monthly amount that reaches that
            shortfall by the goal date, then split across asset classes using your Returns assumptions.
          </p>
        </Section>
      </div>
    </main>
  );
}

/** A scrubbable month-by-month view of a goal: drag to any month between today
 *  and the goal date to see the projected corpus and how far it is from target. */
function GoalTimelineFt({
  available,
  sip,
  eff,
  stepUp,
  months,
  target,
}: {
  available: number;
  sip: number;
  eff: number;
  stepUp: number;
  months: number;
  target: number;
}) {
  const [t, setT] = useState(months);
  const corpus = available * Math.pow(1 + eff, t / 12) + sipAccumulated(sip, t, eff, stepUp);
  const gap = target - corpus;
  const onTrack = gap <= 0.5;
  const date = addMonths(new Date(), t);
  const tag = t <= 0 ? ' · today' : t >= months ? ' · goal date' : '';
  return (
    <div className="ft-gtl">
      <div className="ft-gtl__head">
        <span className="muted">By {formatMonthYear(date)}{tag}</span>
        <strong>{compactINR(corpus)}</strong>
      </div>
      <input
        className="ft-gtl__range"
        type="range"
        min={0}
        max={months}
        value={t}
        onChange={(e) => setT(Number(e.target.value))}
        aria-label="Scrub goal timeline"
        data-noswipe
      />
      <div className="ft-gtl__read">
        <span className={onTrack ? 'ft-pos' : 'ft-neg'}>
          {onTrack ? 'Surplus' : 'Short by'} {compactINR(Math.abs(gap))}
        </span>
        <span className="muted">target {compactINR(target)}</span>
      </div>
    </div>
  );
}
