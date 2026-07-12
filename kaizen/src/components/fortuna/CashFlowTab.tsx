import { useMemo } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import { computeCashFlow } from '../../core/plannerMath';
import HoldingList from './HoldingList';
import { Section, MoneyRow, TotalRow, Stat, formatINR } from './shared';

export default function CashFlowTab({ plan, update }: FortunaTabProps) {
  const cf = useMemo(() => computeCashFlow(plan.cashFlow), [plan.cashFlow]);
  const emergencyTarget = plan.cashFlow.emergencyTarget ?? cf.recommendedEmergencyFund;
  const hasOverride = typeof plan.cashFlow.emergencyTarget === 'number';
  const liquidCash = plan.assets.debt.liquidCash;

  return (
    <main className="app__body">
      <div className="page ft-page">
        <div className="ft-hero">
          <Stat
            label="Monthly investing surplus"
            value={cf.investingSurplus}
            tone={cf.investingSurplus < 0 ? 'neg' : 'pos'}
          />
          <div className="ft-hero__split">
            <div className="ft-hero__cell">
              <span className="ft-hero__k">Inflows</span>
              <span className="ft-hero__v">{formatINR(cf.totalInflows)}</span>
            </div>
            <div className="ft-hero__cell">
              <span className="ft-hero__k">Outflows</span>
              <span className="ft-hero__v ft-neg">{formatINR(cf.totalOutflows)}</span>
            </div>
          </div>
        </div>

        <Section title="Inflows" subtitle="Money coming in each month — rename, edit, remove or add lines">
          <HoldingList
            rows={plan.cashFlow.inflows}
            namePlaceholder="Inflow name"
            addLabel="Add inflow"
            total
            totalLabel="Total inflows"
            onChange={(m) => update((d) => m(d.cashFlow.inflows))}
          />
        </Section>

        <Section title="Outflows" subtitle="Money going out each month — rename, edit, remove or add lines">
          <HoldingList
            rows={plan.cashFlow.outflows}
            namePlaceholder="Outflow name"
            addLabel="Add outflow"
            total
            totalLabel="Total outflows"
            onChange={(m) => update((d) => m(d.cashFlow.outflows))}
          />
        </Section>

        <Section title="Investing surplus" subtitle="What's left to invest">
          <TotalRow label="Inflows − Outflows" value={cf.investingSurplus} strong />
        </Section>

        <Section title="Emergency fund" subtitle="Set your target; default is 6 months of outflows">
          <MoneyRow
            label="Target"
            hint={hasOverride ? `Recommended: ${formatINR(cf.recommendedEmergencyFund)}` : '6 × monthly outflows'}
            value={emergencyTarget}
            onChange={(v) => update((d) => { d.cashFlow.emergencyTarget = v; })}
          />
          {hasOverride && (
            <button
              className="ft-addrow"
              onClick={() => update((d) => { delete d.cashFlow.emergencyTarget; })}
            >
              Use recommended ({formatINR(cf.recommendedEmergencyFund)})
            </button>
          )}
          <TotalRow label="You have (liquid cash)" value={liquidCash} />
          {emergencyTarget > 0 &&
            (liquidCash >= emergencyTarget ? (
              <p className="ft-note ft-ok">✓ Your liquid cash covers your emergency fund.</p>
            ) : (
              <p className="ft-note">
                Shortfall: <strong>{formatINR(emergencyTarget - liquidCash)}</strong> — top up your liquid savings
                before locking money into long-term investments.
              </p>
            ))}
        </Section>
      </div>
    </main>
  );
}
