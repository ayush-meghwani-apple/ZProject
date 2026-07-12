import { useMemo } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import { computeCashFlow } from '../../core/plannerMath';
import { Section, MoneyRow, TotalRow, Stat, formatINR } from './shared';

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

        <Section title="Inflows" subtitle="Money coming in each month">
          <MoneyRow
            label="Post-tax salary"
            value={plan.cashFlow.inflows.salary}
            onChange={(v) => update((d) => { d.cashFlow.inflows.salary = v; })}
          />
          <MoneyRow
            label="Business income"
            value={plan.cashFlow.inflows.business}
            onChange={(v) => update((d) => { d.cashFlow.inflows.business = v; })}
          />
          <MoneyRow
            label="Rental income"
            value={plan.cashFlow.inflows.rental}
            onChange={(v) => update((d) => { d.cashFlow.inflows.rental = v; })}
          />
          <MoneyRow
            label="Others"
            value={plan.cashFlow.inflows.others}
            onChange={(v) => update((d) => { d.cashFlow.inflows.others = v; })}
          />
          <TotalRow label="Total inflows" value={cf.totalInflows} strong />
        </Section>

        <Section title="Outflows" subtitle="Money going out each month">
          <MoneyRow
            label="Monthly expenses"
            value={plan.cashFlow.outflows.expenses}
            onChange={(v) => update((d) => { d.cashFlow.outflows.expenses = v; })}
          />
          <MoneyRow
            label="Compulsory investments"
            hint="ULIPs, chit funds…"
            value={plan.cashFlow.outflows.compulsoryInvestments}
            onChange={(v) => update((d) => { d.cashFlow.outflows.compulsoryInvestments = v; })}
          />
          <MoneyRow
            label="Loan EMIs"
            value={plan.cashFlow.outflows.loanEmis}
            onChange={(v) => update((d) => { d.cashFlow.outflows.loanEmis = v; })}
          />
          <MoneyRow
            label="Insurance premiums"
            value={plan.cashFlow.outflows.insurance}
            onChange={(v) => update((d) => { d.cashFlow.outflows.insurance = v; })}
          />
          <MoneyRow
            label="Others"
            value={plan.cashFlow.outflows.others}
            onChange={(v) => update((d) => { d.cashFlow.outflows.others = v; })}
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
