import { useMemo } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import { computeCashFlow } from '../../core/plannerMath';
import HoldingList from './HoldingList';
import { Section, TotalRow, Stat, formatINR } from './shared';

export default function CashFlowTab({ plan, update }: FortunaTabProps) {
  const cf = useMemo(() => computeCashFlow(plan.cashFlow), [plan.cashFlow]);

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
            onChange={(m) => update((d) => m(d.cashFlow.inflows))}
          />
          <TotalRow label="Total inflows" value={cf.totalInflows} strong />
        </Section>

        <Section title="Outflows" subtitle="Money going out each month — rename, edit, remove or add lines">
          <HoldingList
            rows={plan.cashFlow.outflows}
            namePlaceholder="Outflow name"
            addLabel="Add outflow"
            onChange={(m) => update((d) => m(d.cashFlow.outflows))}
          />
          <TotalRow label="Total outflows" value={cf.totalOutflows} strong />
        </Section>

        <Section title="Investing surplus" subtitle="What's left to invest">
          <TotalRow label="Inflows − Outflows" value={cf.investingSurplus} strong />
          <p className="ft-note">
            Recommended emergency fund (6 months of outflows): <strong>{formatINR(cf.recommendedEmergencyFund)}</strong>
          </p>
        </Section>

        <Section title="Emergency fund" subtitle="6 months of outflows, held as liquid cash">
          <TotalRow label="Recommended" value={cf.recommendedEmergencyFund} />
          <TotalRow label="You have (liquid cash)" value={plan.assets.debt.liquidCash} />
          {cf.recommendedEmergencyFund > 0 &&
            (plan.assets.debt.liquidCash >= cf.recommendedEmergencyFund ? (
              <p className="ft-note ft-ok">✓ Your liquid cash covers your emergency fund.</p>
            ) : (
              <p className="ft-note">
                Shortfall: <strong>{formatINR(cf.recommendedEmergencyFund - plan.assets.debt.liquidCash)}</strong> — top
                up your liquid savings before locking money into long-term investments.
              </p>
            ))}
        </Section>
      </div>
    </main>
  );
}
