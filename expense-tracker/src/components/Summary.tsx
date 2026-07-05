import { useEffect, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getCategoryBreakdown,
  getCategorySummary,
  getMonthlyTotals,
  getSubcategorySummary,
  totalSpend,
} from '../core/reports';
import { formatINR } from '../core/util';
import { ExpenseRepository } from '../repository/expenseRepository';
import { CategoryRepository } from '../repository/categoryRepository';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import CycleFilter, { filterByCycles, selectionLabel } from './CycleFilter';
import AppIcon from './AppIcon';
import type { Category, Expense, SalaryCycle, Subcategory } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
}

/** Translucent version of a hex colour, for a soft coloured pill background. */
function tint(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

const RAD = Math.PI / 180;

/** Outside pie label that keeps the category name but truncates long ones so
 *  they never spill past the card edge. */
function pieLabel({ cx, cy, midAngle, outerRadius, name }: any) {
  const r = outerRadius + 12;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  const short = name.length > 9 ? name.slice(0, 8) + '…' : name;
  return (
    <text
      x={x}
      y={y}
      fill="#cbd5e1"
      fontSize={10}
      fontWeight={600}
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
    >
      {short}
    </text>
  );
}

/** A tidy rounded tooltip for the monthly bar chart (replaces the default box). */
function BarTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="charttip">
      <span className="charttip__label">{label}</span>
      <strong className="charttip__val">{formatINR(payload[0].value)}</strong>
    </div>
  );
}
/**
 * The single "Summary" tab: combines the at-a-glance totals + collapsible
 * category breakdown + recent expenses (formerly Dashboard) with the charts
 * (pie + monthly trend, formerly Reports), so there's one place to understand
 * your spending instead of two overlapping tabs.
 */
export default function Summary({ version }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drillId, setDrillId] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ name: string; total: number; color: string } | null>(null);
  const lastClick = useRef<{ id: string; t: number }>({ id: '', t: 0 });
  const initialized = useRef(false);

  // Dismiss the picked-slice amount only when tapping somewhere that is neither a
  // slice nor the amount pill itself (so tapping the pill keeps it open).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Element;
      if (!t?.closest?.('.recharts-sector') && !t?.closest?.('.pie__pick')) {
        setPicked(null);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Recharts makes its SVG surface + sectors keyboard-focusable. On iOS, tapping
  // a slice focuses that element and Safari scrolls it into view, which nudges
  // the visual viewport and pushes our fixed bottom tab bar off-screen. Two
  // guards: (1) keep stripping the tabindex recharts adds, and (2) if a chart
  // element still manages to grab focus, blur it immediately so nothing scrolls.
  useEffect(() => {
    document
      .querySelectorAll('.recharts-wrapper [tabindex], .recharts-surface[tabindex]')
      .forEach((el) => el.setAttribute('tabindex', '-1'));
  });

  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.recharts-wrapper')) t.blur?.();
    }
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  async function load() {
    const [e, c, s, cy] = await Promise.all([
      ExpenseRepository.getExpensesSorted(),
      CategoryRepository.getCategories(),
      CategoryRepository.getSubcategories(),
      SalaryCycleRepository.getCyclesSorted(),
    ]);
    setExpenses(e);
    setCategories(c);
    setSubcategories(s);
    setCycles(cy);

    if (!initialized.current && cy.length > 0) {
      const open = cy.find((x) => !x.endDate) ?? cy[0];
      setSelected([open.id]);
      initialized.current = true;
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const scoped = filterByCycles(expenses, cycles, selected);
  const scopeTotal = totalSpend(scoped);
  const allTimeTotal = totalSpend(expenses);
  const breakdown = getCategoryBreakdown(scoped, categories, subcategories);
  const categorySummary = getCategorySummary(scoped, categories);
  const monthly = getMonthlyTotals(scoped);

  const drill = drillId ? categorySummary.find((c) => c.categoryId === drillId) : null;
  const drillData = drill ? getSubcategorySummary(scoped, subcategories, drill.categoryId) : [];

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="page">
      <CycleFilter cycles={cycles} value={selected} onChange={setSelected} />

      <div className="grid-2">
        <div className="card">
          <h3>{selectionLabel(cycles, selected)}</h3>
          <div className="stat">{formatINR(scopeTotal)}</div>
          <div className="stat--sub">{scoped.length} expenses</div>
        </div>
        <div className="card">
          <h3>All-time</h3>
          <div className="stat">{formatINR(allTimeTotal)}</div>
          <div className="stat--sub">{expenses.length} expenses total</div>
        </div>
      </div>

      {scoped.length > 0 && (
        <div className="card">
          <div className="pie__head">
            <h3>{drill ? drill.name : 'Spend by Category'}</h3>
            {drill && (
              <button className="btn btn--ghost btn--sm" onClick={() => setDrillId(null)}>
                <AppIcon name="back" size={15} /> All categories
              </button>
            )}
          </div>
          <p className="card__subtitle">
            {drill
              ? 'Sub-category breakdown.'
              : 'Tap a slice for its amount · double-tap to break it down.'}
          </p>

          <div className="pie__pickslot">
            {picked ? (
              <div
                className="pie__pick"
                style={{ background: tint(picked.color, 0.18), borderColor: picked.color }}
              >
                <span className="pie__pick-dot" style={{ background: picked.color }} />
                <span className="pie__pick-name">{picked.name}</span>
                <strong style={{ color: picked.color }}>{formatINR(picked.total)}</strong>
              </div>
            ) : (
              <span className="pie__hint">Tap a slice to see its amount</span>
            )}
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              {drill ? (
                <Pie
                  data={drillData}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={72}
                  label={pieLabel}
                  labelLine={false}
                  isAnimationActive={false}
                  onClick={(_, index) => {
                    const s = drillData[index];
                    if (s) setPicked({ name: s.name, total: s.total, color: s.color });
                  }}
                >
                  {drillData.map((s) => (
                    <Cell key={s.subcategoryId} fill={s.color} style={{ cursor: 'pointer' }} />
                  ))}
                </Pie>
              ) : (
                <Pie
                  data={categorySummary}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={72}
                  label={pieLabel}
                  labelLine={false}
                  isAnimationActive={false}
                  onClick={(_, index) => {
                    const c = categorySummary[index];
                    if (!c) return;
                    const now = Date.now();
                    const isSecond =
                      lastClick.current.id === c.categoryId && now - lastClick.current.t < 350;
                    lastClick.current = { id: c.categoryId, t: now };
                    if (isSecond) {
                      // Double-tap → drill into the sub-category breakdown.
                      if (c.categoryId !== 'uncategorized') {
                        setDrillId(c.categoryId);
                        setPicked(null);
                      }
                    } else {
                      // Single-tap → show the amount pill and keep it open (a
                      // second tap within 350ms turns it into a drill instead).
                      setPicked({ name: c.name, total: c.total, color: c.color });
                    }
                  }}
                >
                  {categorySummary.map((c) => (
                    <Cell key={c.categoryId} fill={c.color} style={{ cursor: 'pointer' }} />
                  ))}
                </Pie>
              )}
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card">
        <h3>Spending by Category</h3>
        <p className="card__subtitle">Tap a category to expand its sub-categories.</p>
        {breakdown.length === 0 ? (
          <div className="muted">No expenses yet.</div>
        ) : (
          breakdown.map((c) => {
            const pct = scopeTotal > 0 ? Math.round((c.total / scopeTotal) * 100) : 0;
            const open = expanded.has(c.categoryId);
            return (
              <div className="barrow" key={c.categoryId}>
                <button
                  className="barrow__head"
                  onClick={() => toggle(c.categoryId)}
                  disabled={c.subs.length === 0}
                >
                  <span className="barrow__chev">
                    {c.subs.length === 0 ? '' : <AppIcon name={open ? 'chevronDown' : 'chevronRight'} size={14} />}
                  </span>
                  <span className="barrow__name">
                    {c.icon} {c.name}
                  </span>
                  <span className="barrow__pct">{pct}%</span>
                  <span className="barrow__amt">{formatINR(c.total)}</span>
                </button>
                <div className="barrow__track">
                  <div
                    className="barrow__fill"
                    style={{ width: `${pct}%`, background: c.color }}
                  />
                </div>
                {open && (
                  <div className="barrow__subs">
                    {c.subs.map((s) => (
                      <div className="barrow__sub" key={s.subcategoryId}>
                        <span>
                          ↳ {s.icon ? s.icon + ' ' : ''}
                          {s.name}
                        </span>
                        <span className="muted">
                          {formatINR(s.total)} · {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {monthly.length > 0 && (
        <div className="card">
          <h3>Monthly Spend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly}>
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} width={40} />
              <Tooltip
                content={<BarTip />}
                cursor={false}
              />
              <Bar
                dataKey="total"
                fill="#38bdf8"
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
                activeBar={{ stroke: '#0369a1', strokeWidth: 2.5 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
