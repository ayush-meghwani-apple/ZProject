import { Fragment, useMemo, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import {
  computeNetWorth,
  targetAllocation,
  activeAssumptions,
  classLabelMap,
  trackedFundsByClass,
} from '../../core/plannerMath';
import type { AssetClassKey } from '../../types/models';
import HoldingList from './HoldingList';
import AppIcon from '../AppIcon';
import { Section, TotalRow, Stat, formatINR } from './shared';
import { TrendCard } from './Sparkline';

const CLASS_COLOR: Record<AssetClassKey, string> = {
  domestic_equity: '#6366f1',
  us_equity: '#0ea5e9',
  debt: '#22c55e',
  gold: '#f59e0b',
  crypto: '#a855f7',
  real_estate: '#ef4444',
};
/** Palette for custom classes (cycled by order). */
const CUSTOM_COLORS = ['#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16', '#06b6d4'];

/** Normalise the many category spellings (manual EQUITY_CATS + tracked MFCategory)
 *  to one key so stocks vs fund-type breakdown groups cleanly. */
const EQUITY_CAT_LABELS: Record<string, string> = {
  largecap: 'Large cap',
  midcap: 'Mid cap',
  smallcap: 'Small cap',
  flexicap: 'Flexi / Multi cap',
  hybrid: 'Hybrid',
  other: 'Other funds',
};
function normEquityCat(raw: string): string {
  const s = (raw || '').toLowerCase();
  if (s.includes('large')) return 'largecap';
  if (s.includes('mid')) return 'midcap';
  if (s.includes('small')) return 'smallcap';
  if (s.includes('flexi') || s.includes('multi')) return 'flexicap';
  if (s.includes('hybrid')) return 'hybrid';
  return 'other';
}

export default function NetWorthTab({ plan, update }: FortunaTabProps) {
  const disabled = plan.disabledClasses ?? [];
  const custom = plan.customClasses ?? [];
  const tracked = useMemo(() => trackedFundsByClass(plan.mutualFunds), [plan.mutualFunds]);
  const nw = useMemo(
    () => computeNetWorth(plan.assets, plan.liabilities, disabled, custom, tracked),
    [plan.assets, plan.liabilities, disabled, custom, tracked],
  );
  const active = useMemo(() => activeAssumptions(plan.assumptions, disabled), [plan.assumptions, disabled]);
  const target = useMemo(
    () => targetAllocation(plan.goals, active, plan.horizons),
    [plan.goals, active, plan.horizons],
  );
  const labelMap = useMemo(() => classLabelMap(active), [active]);

  // A stable colour per class key (built-ins fixed; customs cycle a palette).
  const colorFor = useMemo(() => {
    const map: Record<string, string> = { ...CLASS_COLOR };
    custom.forEach((c, i) => { map[c.id] = CUSTOM_COLORS[i % CUSTOM_COLORS.length]; });
    return (k: string) => map[k] ?? '#94a3b8';
  }, [custom]);

  const mix = nw.byClass.filter((c) => c.value > 0);
  const targetKeys = Object.keys(target).filter((k) => target[k] > 0);
  const targetTotal = targetKeys.reduce((s, k) => s + target[k], 0);

  // Break domestic equity into Stocks + mutual funds by type (manual rows +
  // auto-tracked funds), so the mix can be drilled into one level deeper.
  const [deOpen, setDeOpen] = useState(false);
  const deBreak = useMemo(() => {
    const a = plan.assets;
    const n = (v: number) => (Number.isFinite(v) ? v : 0);
    const catMap = new Map<string, number>();
    const add = (raw: string, val: number) => {
      if (!(val > 0)) return;
      const k = normEquityCat(raw);
      catMap.set(k, (catMap.get(k) ?? 0) + val);
    };
    for (const r of a.domesticEquity.mutualFunds) add(r.category ?? 'other', n(r.value));
    for (const f of plan.mutualFunds ?? []) {
      if (f.category === 'debt') continue; // debt funds belong to the Debt class
      const units = (f.transactions ?? []).reduce((s, t) => s + n(t.units), 0);
      add(f.category, units * n(f.latestNav ?? 0));
    }
    const rows = [{ label: 'Stocks', value: a.domesticEquity.stocks.reduce((s, r) => s + n(r.value), 0) }];
    for (const [k, v] of [...catMap.entries()].sort((x, y) => y[1] - x[1])) rows.push({ label: EQUITY_CAT_LABELS[k] ?? k, value: v });
    if (n(a.misc.smallcase) > 0) rows.push({ label: 'Smallcase', value: n(a.misc.smallcase) });
    if (n(a.misc.ulips) > 0) rows.push({ label: 'ULIPs / insurance', value: n(a.misc.ulips) });
    return rows.filter((r) => r.value > 0);
  }, [plan.assets, plan.mutualFunds]);

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

        {(plan.snapshots?.length ?? 0) >= 2 && (
          <TrendCard
            title="Net worth trend"
            values={(plan.snapshots ?? []).map((s) => s.netWorth)}
            stroke="#22c55e"
          />
        )}

        <Section title="Current asset mix" subtitle="Where your money sits today, by asset class">
          {nw.totalAssets > 0 ? (
            <>
              <div className="ft-bar">
                {mix.map((c) => (
                  <span
                    key={c.key}
                    className="ft-bar__seg"
                    style={{ width: `${(c.value / nw.totalAssets) * 100}%`, background: colorFor(c.key) }}
                    title={c.label}
                  />
                ))}
              </div>
              <ul className="ft-legend">
                {mix.map((c) => {
                  const expandable = c.key === 'domestic_equity' && deBreak.length > 1;
                  return (
                    <Fragment key={c.key}>
                      <li
                        className={`ft-legend__item ${expandable ? 'ft-legend__item--exp' : ''}`}
                        onClick={expandable ? () => setDeOpen((o) => !o) : undefined}
                      >
                        <span className="ft-legend__dot" style={{ background: colorFor(c.key) }} />
                        <span className="ft-legend__label">
                          {c.label}
                          {expandable && <AppIcon name={deOpen ? 'chevronUp' : 'chevronDown'} size={13} className="ft-legend__chev" />}
                        </span>
                        <span className="ft-legend__pct">{Math.round((c.value / nw.totalAssets) * 100)}%</span>
                        <span className="ft-legend__val">{formatINR(c.value)}</span>
                      </li>
                      {expandable && deOpen &&
                        deBreak.map((s) => (
                          <li key={`${c.key}-${s.label}`} className="ft-legend__item ft-legend__sub">
                            <span className="ft-legend__label">{s.label}</span>
                            <span className="ft-legend__pct">{Math.round(c.value ? (s.value / c.value) * 100 : 0)}%</span>
                            <span className="ft-legend__val">{formatINR(s.value)}</span>
                          </li>
                        ))}
                    </Fragment>
                  );
                })}
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
              {targetKeys.map((k) => (
                <li key={k} className="ft-legend__item">
                  <span className="ft-legend__dot" style={{ background: colorFor(k) }} />
                  <span className="ft-legend__label">{labelMap[k] ?? k}</span>
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
            total
            totalLabel="Total liabilities"
            onChange={(m) => update((d) => m(d.liabilities.items))}
          />
        </Section>
      </div>
    </main>
  );
}
