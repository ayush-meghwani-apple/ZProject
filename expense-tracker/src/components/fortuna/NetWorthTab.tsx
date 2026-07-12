import { useMemo } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import { computeNetWorth, targetAllocation, assetClassTotals, activeAssumptions, CLASS_LABEL } from '../../core/plannerMath';
import type { AssetClassKey } from '../../types/models';
import HoldingList from './HoldingList';
import { Section, TotalRow, Stat, formatINR } from './shared';

const CLASS_ORDER: AssetClassKey[] = [
  'domestic_equity',
  'us_equity',
  'debt',
  'gold',
  'crypto',
  'real_estate',
];

const CLASS_COLOR: Record<AssetClassKey, string> = {
  domestic_equity: '#6366f1',
  us_equity: '#0ea5e9',
  debt: '#22c55e',
  gold: '#f59e0b',
  crypto: '#a855f7',
  real_estate: '#ef4444',
};

export default function NetWorthTab({ plan, update }: FortunaTabProps) {
  const disabled = plan.disabledClasses ?? [];
  const nw = useMemo(() => computeNetWorth(plan.assets, plan.liabilities, disabled), [plan.assets, plan.liabilities, disabled]);
  const totals = useMemo(() => assetClassTotals(plan.assets, disabled), [plan.assets, disabled]);
  const target = useMemo(
    () => targetAllocation(plan.goals, activeAssumptions(plan.assumptions, disabled)),
    [plan.goals, plan.assumptions, disabled],
  );

  const targetTotal = CLASS_ORDER.reduce((s, k) => s + target[k], 0);

  return (
    <main className="app__body">
      <div className="page ft-page">
        <div className="ft-hero">
          <Stat label="Total Net Worth" value={nw.netWorth} tone={nw.netWorth < 0 ? 'neg' : 'pos'} />
          <div className="ft-hero__split">
            <div className="ft-hero__cell">
              <span className="ft-hero__k">Assets</span>
              <span className="ft-hero__v">{formatINR(nw.totalAssets)}</span>
            </div>
            <div className="ft-hero__cell">
              <span className="ft-hero__k">Liabilities</span>
              <span className="ft-hero__v ft-neg">{formatINR(nw.totalLiabilities)}</span>
            </div>
            <div className="ft-hero__cell">
              <span className="ft-hero__k">Liquid</span>
              <span className="ft-hero__v">{formatINR(nw.liquid)}</span>
            </div>
          </div>
        </div>

        <Section title="Current asset mix" subtitle="Where your money sits today, by asset class">
          {nw.totalAssets > 0 ? (
            <>
              <div className="ft-bar">
                {CLASS_ORDER.map((k) =>
                  totals[k] > 0 ? (
                    <span
                      key={k}
                      className="ft-bar__seg"
                      style={{ width: `${(totals[k] / nw.totalAssets) * 100}%`, background: CLASS_COLOR[k] }}
                      title={CLASS_LABEL[k]}
                    />
                  ) : null,
                )}
              </div>
              <ul className="ft-legend">
                {CLASS_ORDER.filter((k) => totals[k] > 0).map((k) => (
                  <li key={k} className="ft-legend__item">
                    <span className="ft-legend__dot" style={{ background: CLASS_COLOR[k] }} />
                    <span className="ft-legend__label">{CLASS_LABEL[k]}</span>
                    <span className="ft-legend__pct">{Math.round((totals[k] / nw.totalAssets) * 100)}%</span>
                    <span className="ft-legend__val">{formatINR(totals[k])}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">Add your holdings in the Portfolio tab to see your asset mix.</p>
          )}
        </Section>

        {targetTotal > 0 && (
          <Section
            title="Target monthly investment"
            subtitle="How your goals' SIPs should be split across asset classes"
          >
            <ul className="ft-legend">
              {CLASS_ORDER.filter((k) => target[k] > 0).map((k) => (
                <li key={k} className="ft-legend__item">
                  <span className="ft-legend__dot" style={{ background: CLASS_COLOR[k] }} />
                  <span className="ft-legend__label">{CLASS_LABEL[k]}</span>
                  <span className="ft-legend__pct">{Math.round((target[k] / targetTotal) * 100)}%</span>
                  <span className="ft-legend__val">{formatINR(target[k])}/mo</span>
                </li>
              ))}
            </ul>
            <TotalRow label="Total monthly SIP" value={targetTotal} strong />
          </Section>
        )}

        <Section title="Assets breakdown" subtitle="Liquid vs illiquid">
          <TotalRow label="Illiquid" value={nw.illiquid} />
          <TotalRow label="Liquid" value={nw.liquid} />
          <TotalRow label="Total assets" value={nw.totalAssets} strong />
        </Section>

        <Section title="Liabilities" subtitle="What you owe — rename, edit, remove or add lines">
          <HoldingList
            rows={plan.liabilities.items}
            namePlaceholder="Liability name"
            addLabel="Add liability"
            onChange={(m) => update((d) => m(d.liabilities.items))}
          />
          <TotalRow label="Total liabilities" value={nw.totalLiabilities} strong />
        </Section>
      </div>
    </main>
  );
}
