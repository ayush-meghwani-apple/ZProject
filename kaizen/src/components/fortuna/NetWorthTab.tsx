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
import type { AssetClassKey, DaySnapshot, HoldingRow } from '../../types/models';
import HoldingList from './HoldingList';
import AppIcon, { type IconName } from '../AppIcon';
import { Section, TotalRow, formatINR } from './shared';
import LineChart from './LineChart';
import Donut from './Donut';
import { sliceDays, dayLabel, type ChartRange } from '../../core/planSnapshot';

const CHART_RANGES: ChartRange[] = ['1W', '1M', '3M', '6M', 'MAX'];
const rangeLabel = (r: ChartRange) => (r === '1W' ? '7D' : r === 'MAX' ? 'Max' : r);

/** Compact rupee for tight spots (donut centre): ₹89.34L, ₹1.24Cr. */
function compactINR(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `₹${Math.round(v / 1e3)}k`;
  return formatINR(v);
}

/** Pick an icon for a liability from its name (best-effort keyword match). */
function liabilityIcon(name: string): IconName {
  const n = name.toLowerCase();
  if (/home|house|mortgage|property/.test(n)) return 'home';
  if (/educat|student|study/.test(n)) return 'education';
  if (/credit|card/.test(n)) return 'creditcard';
  if (/\bcar\b|vehicle|auto|bike|scooter/.test(n)) return 'car';
  if (/gold|personal|jewel/.test(n)) return 'family';
  return 'info';
}

const CLASS_COLOR: Record<AssetClassKey, string> = {
  domestic_equity: '#6366f1',
  equity_mf: '#818cf8',
  us_equity: '#0ea5e9',
  debt: '#22c55e',
  gold: '#f59e0b',
  crypto: '#a855f7',
  real_estate: '#ef4444',
};
/** Palette for custom classes (cycled by order). */
const CUSTOM_COLORS = ['#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#84cc16', '#06b6d4'];

export default function NetWorthTab({ plan, update, goTo }: FortunaTabProps) {
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
  const breakdownFor = (key: string) => classBreakdown(plan.assets, key, plan.mutualFunds ?? [], custom);

  // "Assets over time" line chart — from daily snapshots, so it starts the day
  // tracking began and builds forward (no misleading back-to-inception jumps).
  const days = plan.daySnapshots ?? [];
  const [range, setRange] = useState<ChartRange>('1M');
  const valueOf = (s: DaySnapshot): number => s.totalAssets;
  const chartDays = sliceDays(days, range);

  return (
    <main className="app__body">
      <div className="page ft-page">
        <div className="ft-hero">
          <span className="ft-hero__label">
            Total Net Worth
            <span className="ft-hero__info" title="Assets minus liabilities across every enabled class"><AppIcon name="info" size={13} /></span>
          </span>
          <span className={`ft-hero__net ${nw.netWorth < 0 ? 'ft-neg' : 'ft-pos'}`}>{formatINR(nw.netWorth)}</span>
          <div className="ft-hero__split">
            <div className="ft-hero__cell">
              <span className="ft-hero__k"><span className="ft-hero__ki"><AppIcon name="expensify" size={12} /></span> Assets</span>
              <span className="ft-hero__v">{formatINR(nw.totalAssets)}</span>
            </div>
            <div className="ft-hero__cell">
              <span className="ft-hero__k"><span className="ft-hero__ki"><AppIcon name="cashflow" size={12} /></span> Liabilities</span>
              <span className="ft-hero__v ft-neg">{formatINR(nw.totalLiabilities)}</span>
            </div>
            <div className="ft-hero__cell">
              <span className="ft-hero__k"><span className="ft-hero__ki"><AppIcon name="liquid" size={12} /></span> Liquid</span>
              <span className="ft-hero__v">{formatINR(nw.liquid)}</span>
            </div>
          </div>
        </div>

        <Section title="Assets over time" subtitle="Track the growth of your assets">
          <div className="ft-chartctl">
            <div className="ft-chartctl__ranges">
              {CHART_RANGES.map((r) => (
                <button
                  key={r}
                  className={range === r ? 'active' : ''}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setRange(r)}
                >
                  {rangeLabel(r)}
                </button>
              ))}
            </div>
          </div>
          <LineChart
            labels={chartDays.map((s) => dayLabel(s.d))}
            series={[{ label: 'Total assets', color: '#6366f1', values: chartDays.map(valueOf) }]}
            emptyHint="Open Fortuna over a few days and this chart of your assets will build up from today."
          />
        </Section>

        <Section title="Current asset mix" subtitle="Where your money is invested">
          {nw.totalAssets > 0 ? (
            <>
              <div className="ft-mix">
                <Donut
                  size={144}
                  thickness={17}
                  segments={mix.map((c) => ({ value: c.value, color: colorFor(c.key) }))}
                >
                  <span className="ft-donut__big">{compactINR(nw.totalAssets)}</span>
                  <span className="ft-donut__lbl">Total Assets</span>
                </Donut>
                <div className="ft-mix__legend">
                  <div className="ft-mix__lhead">
                    <span>%</span>
                    <span>Amount</span>
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
                </div>
              </div>
              {goTo && (
                <button className="ft-viewlink" onClick={() => goTo('portfolio')}>
                  View all assets <AppIcon name="chevronRight" size={15} />
                </button>
              )}
            </>
          ) : (
            <p className="muted">Add your holdings in the Portfolio tab to see your asset mix.</p>
          )}
        </Section>

        {targetTotal > 0 && (
          <Section
            title="Target monthly investment"
            subtitle="Where your goal SIPs stack up against target asset classes"
          >
            <div className="ft-mix ft-mix--rev">
              <div className="ft-mix__legend">
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
              </div>
              <Donut
                size={132}
                thickness={15}
                segments={targetKeys.map((k) => ({ value: target[k], color: colorFor(k) }))}
              >
                <span className="ft-donut__ring"><AppIcon name="goals" size={26} /></span>
              </Donut>
            </div>
            <TotalRow label="Total monthly SIP" value={targetTotal} strong />
            {goTo && (
              <button className="ft-viewlink" onClick={() => goTo('goals')}>
                View SIP goals <AppIcon name="chevronRight" size={15} />
              </button>
            )}
          </Section>
        )}

        <Section title="Assets breakdown" subtitle="Liquid vs illiquid">
          <div className="ft-breakdown">
            <div className="ft-breakrow">
              <span className="ft-breakrow__ic ft-breakrow__ic--liquid"><AppIcon name="liquid" size={16} /></span>
              <span className="ft-breakrow__k">Liquid</span>
              <span className="ft-breakrow__lead" />
              <span className="ft-breakrow__v">{formatINR(nw.liquid)}</span>
            </div>
            <div className="ft-breakrow">
              <span className="ft-breakrow__ic ft-breakrow__ic--illiquid"><AppIcon name="vault" size={16} /></span>
              <span className="ft-breakrow__k">Illiquid</span>
              <span className="ft-breakrow__lead" />
              <span className="ft-breakrow__v">{formatINR(nw.illiquid)}</span>
            </div>
            <div className="ft-breakrow ft-breakrow--total">
              <span className="ft-breakrow__ic ft-breakrow__ic--total"><AppIcon name="layers" size={16} /></span>
              <span className="ft-breakrow__k">Total assets</span>
              <span className="ft-breakrow__lead" />
              <span className="ft-breakrow__v">{formatINR(nw.totalAssets)}</span>
            </div>
          </div>
        </Section>

        <Section title="Liabilities" subtitle="What you owe — rename, edit, remove or add lines">
          <HoldingList
            rows={plan.liabilities.items}
            namePlaceholder="Liability name"
            addLabel="Add liability"
            iconFor={(r: HoldingRow) => liabilityIcon(r.name)}
            total
            totalLabel="Total liabilities"
            onChange={(m) => update((d) => m(d.liabilities.items))}
          />
        </Section>
      </div>
    </main>
  );
}
