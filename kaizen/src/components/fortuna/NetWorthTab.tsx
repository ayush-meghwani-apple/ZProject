import { Fragment, useMemo, useState } from 'react';
import type { FortunaTabProps } from '../FortunaApp';
import {
  computeNetWorth,
  targetAllocation,
  activeAssumptions,
  classLabelMap,
  trackedFundsByClass,
  classBreakdown,
} from '../../core/plannerMath';
import type { AssetClassKey, DaySnapshot } from '../../types/models';
import HoldingList from './HoldingList';
import AppIcon from '../AppIcon';
import { Section, TotalRow, Stat, formatINR } from './shared';
import LineChart from './LineChart';
import { sliceDays, dayLabel, type ChartRange } from '../../core/planSnapshot';

const CHART_RANGES: ChartRange[] = ['1W', '1M', '3M', 'MAX'];

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

  // Drill any asset-class slice down into its parts (stocks / fund types / FDs…).
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const toggleKey = (k: string) =>
    setOpenKeys((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      return s;
    });
  const breakdownFor = (key: string) => classBreakdown(plan.assets, key, plan.mutualFunds ?? [], custom, tracked);

  // "Assets over time" line chart — from daily snapshots, so it starts the day
  // tracking began and builds forward (no misleading back-to-inception jumps).
  const days = plan.daySnapshots ?? [];
  const [range, setRange] = useState<ChartRange>('1M');
  const [metric, setMetric] = useState<string>('total');
  const metricOptions = [
    { k: 'total', label: 'Total assets' },
    { k: 'networth', label: 'Net worth' },
    ...mix.map((c) => ({ k: `class:${c.key}`, label: c.label })),
    { k: 'stocks', label: 'Stocks' },
    { k: 'mf', label: 'Mutual funds' },
  ];
  const valueOf = (s: DaySnapshot): number => {
    if (metric === 'networth') return s.netWorth;
    if (metric === 'stocks') return s.stocks;
    if (metric === 'mf') return s.mfValue;
    if (metric.startsWith('class:')) return s.byClass[metric.slice(6)] ?? 0;
    return s.totalAssets;
  };
  const chartDays = sliceDays(days, range);
  const metricLabel = metricOptions.find((o) => o.k === metric)?.label ?? 'Total assets';

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

        <Section title="Assets over time" subtitle="Builds from the day you start tracking">
          <div className="ft-chartctl">
            <select className="input ft-chartctl__sel" value={metric} onChange={(e) => setMetric(e.target.value)}>
              {metricOptions.map((o) => (
                <option key={o.k} value={o.k}>{o.label}</option>
              ))}
            </select>
            <div className="ft-chartctl__ranges">
              {CHART_RANGES.map((r) => (
                <button
                  key={r}
                  className={range === r ? 'active' : ''}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setRange(r)}
                >
                  {r === 'MAX' ? 'Max' : r}
                </button>
              ))}
            </div>
          </div>
          <LineChart
            labels={chartDays.map((s) => dayLabel(s.d))}
            series={[{ label: metricLabel, color: '#6366f1', values: chartDays.map(valueOf) }]}
            emptyHint="Open Fortuna over a few days and this chart of your assets will build up from today."
          />
        </Section>

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
                  const bd = breakdownFor(c.key);
                  const expandable = bd.length > 1;
                  const open = openKeys.has(c.key);
                  return (
                    <Fragment key={c.key}>
                      <li
                        className={`ft-legend__item ${expandable ? 'ft-legend__item--exp' : ''}`}
                        onClick={expandable ? () => toggleKey(c.key) : undefined}
                      >
                        <span className="ft-legend__dot" style={{ background: colorFor(c.key) }} />
                        <span className="ft-legend__label">
                          {c.label}
                          {expandable && <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={13} className="ft-legend__chev" />}
                        </span>
                        <span className="ft-legend__pct">{Math.round((c.value / nw.totalAssets) * 100)}%</span>
                        <span className="ft-legend__val">{formatINR(c.value)}</span>
                      </li>
                      {expandable && open &&
                        bd.map((s) => (
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
