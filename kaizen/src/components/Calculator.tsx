import { useState } from 'react';
import { projectRetirement, stepUpSipFutureValue } from '../core/finance';
import { formatINR } from '../core/util';
import AmountInput from './AmountInput';

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

/** Step-up SIP what-if. */
function SipCalculator() {
  const [calc, setCalc] = useState({ monthly: 10000, stepUp: 10, years: 2, returnPct: 12 });
  const result = stepUpSipFutureValue(calc.monthly, calc.returnPct, calc.stepUp, calc.years);

  return (
    <div className="card">
      <h3>Step-up SIP Calculator</h3>
      <p className="card__subtitle">
        See what a monthly investment grows to with a yearly step-up — nothing saved, just a quick
        what-if.
      </p>
      <div className="field">
        <label>Monthly investment (₹)</label>
        <AmountInput value={calc.monthly} onChange={(v) => setCalc({ ...calc, monthly: v })} />
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
          <strong>{compactINR(result.invested)}</strong>
        </div>
        <div className="result__row result__row--hero">
          <span>Projected value</span>
          <strong>{compactINR(result.futureValue)}</strong>
        </div>
        <div className="result__row">
          <span>Estimated gain</span>
          <strong className="pos">{compactINR(result.futureValue - result.invested)}</strong>
        </div>
      </div>
    </div>
  );
}

/** Retirement corpus: how much you need by retirement, and if you'll get there. */
function RetirementCalculator() {
  const [calc, setCalc] = useState({
    monthlyExpense: 70000,
    inflationPct: 6,
    yearsToRetire: 21,
    retireYears: 20,
    currentSavings: 0,
    monthlyInvest: 25000,
    stepUpPct: 10,
    returnPct: 12,
  });

  const p = projectRetirement(calc);

  return (
    <div className="card">
      <h3>Retirement Corpus Calculator</h3>
      <p className="card__subtitle">
        How big a corpus you need by retirement to cover your expenses (rising with inflation every
        year) for as long as you'll need it — and how much to invest each month to get there.
      </p>

      <div className="field">
        <label>Monthly expenses today (₹)</label>
        <AmountInput
          value={calc.monthlyExpense}
          onChange={(v) => setCalc({ ...calc, monthlyExpense: v })}
        />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Inflation (% p.a.)</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={calc.inflationPct}
            onChange={(e) => setCalc({ ...calc, inflationPct: num(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Years until retirement</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={calc.yearsToRetire}
            onChange={(e) => setCalc({ ...calc, yearsToRetire: num(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Years of expenses after retiring</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={calc.retireYears}
            onChange={(e) => setCalc({ ...calc, retireYears: num(e.target.value) })}
          />
        </div>
      </div>

      <div className="result">
        <div className="result__row">
          <span>Monthly expense at retirement</span>
          <strong>{compactINR(p.monthlyExpenseAtRetire)}</strong>
        </div>
        <div className="result__row result__row--hero">
          <span>Corpus needed at retirement</span>
          <strong>{compactINR(p.requiredCorpus)}</strong>
        </div>
      </div>

      <p className="card__subtitle" style={{ marginTop: 14 }}>
        Your savings plan — will it get you there?
      </p>
      <div className="grid-2">
        <div className="field">
          <label>Current savings (₹)</label>
          <AmountInput
            value={calc.currentSavings}
            onChange={(v) => setCalc({ ...calc, currentSavings: v })}
          />
        </div>
        <div className="field">
          <label>Monthly investment (₹)</label>
          <AmountInput
            value={calc.monthlyInvest}
            onChange={(v) => setCalc({ ...calc, monthlyInvest: v })}
          />
        </div>
        <div className="field">
          <label>Yearly step-up (%)</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={calc.stepUpPct}
            onChange={(e) => setCalc({ ...calc, stepUpPct: num(e.target.value) })}
          />
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
      </div>

      <div className="result">
        <div className="result__row">
          <span>Your plan reaches</span>
          <strong>{compactINR(p.projectedCorpus)}</strong>
        </div>
        <div className="result__row">
          <span>{p.onTrack ? 'Surplus' : 'Shortfall'}</span>
          <strong className={p.onTrack ? 'pos' : 'neg'}>{compactINR(Math.abs(p.gap))}</strong>
        </div>
        <div className="result__row result__row--hero">
          <span>Invest this much / month{calc.stepUpPct > 0 ? ` (+${calc.stepUpPct}%/yr)` : ''}</span>
          <strong>{compactINR(p.requiredMonthly)}</strong>
        </div>
      </div>
    </div>
  );
}

/**
 * A home for quick financial what-if calculators. Each calculator is a small
 * self-contained card; more tools can be slotted in here over time.
 */
export default function Calculator() {
  return (
    <div className="page">
      <SipCalculator />
      <RetirementCalculator />
      <div className="empty">More calculators coming here soon.</div>
    </div>
  );
}

