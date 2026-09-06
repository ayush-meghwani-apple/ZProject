import { useMemo, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import type { HoldingRow } from '../../types/models';
import { computeCashFlow } from '../../core/plannerMath';
import HoldingList from './HoldingList';
import AppIcon, { type IconName } from '../AppIcon';
import { FortunaSheet, Section, MoneyRow, TotalRow, Stat, formatINR } from './shared';

export default function CashFlowTab({ plan, update }: FortunaTabProps) {
  const [editing, setEditing] = useState<'inflows' | 'outflows' | 'emergency' | null>(null);
  const cf = useMemo(() => computeCashFlow(plan.cashFlow), [plan.cashFlow]);
  const emergencyTarget = plan.cashFlow.emergencyTarget ?? cf.recommendedEmergencyFund;
  const hasOverride = typeof plan.cashFlow.emergencyTarget === 'number';
  const liquidCash = plan.assets.debt.liquidCash;
  const emergencyGap = emergencyTarget - liquidCash;

  const editButton = (section: 'inflows' | 'outflows' | 'emergency', label: string) => (
    <button className="iconbtn ft-cash__edit" onClick={() => setEditing(section)} aria-label={label} title={label}>
      <AppIcon name="edit" size={16} />
    </button>
  );

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

        <Section title="Inflows" right={editButton('inflows', 'Edit inflows')}>
          <CashFlowSummary rows={plan.cashFlow.inflows} total={cf.totalInflows} totalLabel="Total inflows" />
        </Section>

        <Section title="Outflows" right={editButton('outflows', 'Edit outflows')}>
          <CashFlowSummary rows={plan.cashFlow.outflows} total={cf.totalOutflows} totalLabel="Total outflows" />
        </Section>

        <Section title="Investing surplus">
          <TotalRow label="Inflows − Outflows" value={cf.investingSurplus} strong />
        </Section>

        <Section title="Emergency fund" right={editButton('emergency', 'Edit emergency fund target')}>
          <div className="ft-emergency">
            <div className="ft-emergency__row">
              <span>Target</span>
              <strong>{formatINR(emergencyTarget)}</strong>
            </div>
            <div className="ft-emergency__row">
              <span>Available</span>
              <strong>{formatINR(liquidCash)}</strong>
            </div>
            {emergencyTarget > 0 && (
              <div className={`ft-emergency__status ${emergencyGap > 0 ? 'ft-emergency__status--short' : 'ft-emergency__status--covered'}`}>
                <span>{emergencyGap > 0 ? 'Shortfall' : 'Status'}</span>
                <strong>{emergencyGap > 0 ? formatINR(emergencyGap) : 'Covered'}</strong>
              </div>
            )}
          </div>
        </Section>

        {editing === 'inflows' && (
          <FortunaSheet
            title="Edit Inflows"
            onClose={() => setEditing(null)}
            footer={<CashFormFooter label="Total inflows" total={cf.totalInflows} onDone={() => setEditing(null)} />}
          >
            <HoldingList
              rows={plan.cashFlow.inflows}
              namePlaceholder="Inflow name"
              addLabel="Add inflow"
              total
              totalLabel="Total inflows"
              form
              formStyle="cash"
              iconFor={(row) => cashFlowIcon(row.name, true)}
              onChange={(m) => update((d) => m(d.cashFlow.inflows))}
            />
          </FortunaSheet>
        )}

        {editing === 'outflows' && (
          <FortunaSheet
            title="Edit Outflows"
            onClose={() => setEditing(null)}
            footer={<CashFormFooter label="Total outflows" total={cf.totalOutflows} onDone={() => setEditing(null)} />}
          >
            <HoldingList
              rows={plan.cashFlow.outflows}
              namePlaceholder="Outflow name"
              addLabel="Add outflow"
              total
              totalLabel="Total outflows"
              form
              formStyle="cash"
              iconFor={(row) => cashFlowIcon(row.name, false)}
              onChange={(m) => update((d) => m(d.cashFlow.outflows))}
            />
          </FortunaSheet>
        )}

        {editing === 'emergency' && (
          <FortunaSheet
            title="Emergency fund target"
            onClose={() => setEditing(null)}
            footer={hasOverride ? (
              <button className="btn btn--ghost" onClick={() => update((d) => { delete d.cashFlow.emergencyTarget; })}>
                Use recommended · {formatINR(cf.recommendedEmergencyFund)}
              </button>
            ) : undefined}
          >
            <div className="ft-sheet__form">
              <MoneyRow
                label="Target"
                value={emergencyTarget}
                onChange={(value) => update((d) => { d.cashFlow.emergencyTarget = value; })}
              />
            </div>
          </FortunaSheet>
        )}
      </div>
    </main>
  );
}

function CashFlowSummary({ rows, total, totalLabel }: { rows: HoldingRow[]; total: number; totalLabel: string }) {
  return (
    <div className="ft-cash__summary">
      {rows.length === 0 ? (
        <span className="ft-cash__empty">No entries</span>
      ) : rows.map((row) => (
        <div className="ft-cash__row" key={row.id}>
          <span>{row.name.trim() || 'Untitled'}</span>
          <strong>{formatINR(row.value)}</strong>
        </div>
      ))}
      <div className="ft-cash__total">
        <span>{totalLabel}</span>
        <strong>{formatINR(total)}</strong>
      </div>
    </div>
  );
}

function cashFlowIcon(name: string, inflow: boolean): IconName {
  const normalized = name.toLowerCase();
  if (/rent|home|house/.test(normalized)) return 'home';
  if (/travel|flight/.test(normalized)) return 'travel';
  if (/car|transport|fuel/.test(normalized)) return 'car';
  if (/school|education|tuition/.test(normalized)) return 'education';
  if (/family|partner/.test(normalized)) return 'family';
  if (/interest|dividend|stock|invest/.test(normalized)) return 'investments';
  if (/salary|business|freelance|income/.test(normalized)) return inflow ? 'expensify' : 'creditcard';
  return inflow ? 'cashflow' : 'layers';
}

function CashFormFooter({ label, total, onDone }: { label: string; total: number; onDone: () => void }) {
  return (
    <div className="ft-cashform__footer">
      <span className="ft-cashform__total"><span>{label}</span><strong>{formatINR(total)}</strong></span>
      <button className="btn ft-btn" onClick={onDone}><AppIcon name="done" size={16} /> Done</button>
    </div>
  );
}
