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
  getPaymentMethodSummary,
  getSubcategorySummary,
  totalSpend,
} from '../core/reports';
import { formatINR } from '../core/util';
import { ExpenseRepository } from '../repository/expenseRepository';
import { CategoryRepository } from '../repository/categoryRepository';
import { PaymentMethodRepository } from '../repository/paymentMethodRepository';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import CycleFilter, { filterByCycles, selectionLabel } from './CycleFilter';
import AppIcon from './AppIcon';
import type { Category, Expense, PaymentMethod, SalaryCycle, Subcategory } from '../types/models';

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
  const [picked, setPicked] = useState<{ name: string; total: number; color: string; categoryId?: string } | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [pickedPm, setPickedPm] = useState<{ name: string; total: number; color: string } | null>(null);
  const lastClick = useRef<{ id: string; t: number }>({ id: '', t: 0 });
  const initialized = useRef(false);
  // Robust pie tap: recharts' SVG onClick is unreliable on iOS taps, so we do our
  // own hit-testing on pointerup (see handlePieTap).
  const pieWrapRef = useRef<HTMLDivElement>(null);
  const tapStart = useRef<{ x: number; y: number } | null>(null);
  // Same, for the payment-method pie.
  const pmWrapRef = useRef<HTMLDivElement>(null);
  const pmTapStart = useRef<{ x: number; y: number } | null>(null);

  // Dismiss the picked-slice amount only when tapping somewhere that is neither a
  // slice nor the amount pill itself (so tapping the pill keeps it open).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Element;
      if (!t?.closest?.('.recharts-sector') && !t?.closest?.('.pie__pick')) {
        setPicked(null);
        setPickedPm(null);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Recharts makes its SVG surface + sectors keyboard-focusable. On iOS, tapping
  // a slice focused that element and Safari scrolled it into view (which shoved
  // the fixed tab bar off-screen) and the focus handling also swallowed the tap
  // so the slice did nothing. Strip the tabindex recharts adds entirely so the
  // chart isn't focusable at all — no focus, no scroll, no swallowed tap. Runs
  // every render since recharts re-adds it.
  useEffect(() => {
    document
      .querySelectorAll('.recharts-wrapper [tabindex], .recharts-surface[tabindex]')
      .forEach((el) => el.removeAttribute('tabindex'));
  });

  async function load() {
    const [e, c, s, cy, pm] = await Promise.all([
      ExpenseRepository.getExpensesSorted(),
      CategoryRepository.getCategories(),
      CategoryRepository.getSubcategories(),
      SalaryCycleRepository.getCyclesSorted(),
      PaymentMethodRepository.list(),
    ]);
    setExpenses(e);
    setCategories(c);
    setSubcategories(s);
    setCycles(cy);
    setMethods(pm);

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
  const pmSummary = getPaymentMethodSummary(scoped, methods);

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

  // Find which pie sector is under a point. Recharts renders `.recharts-sector`
  // paths in data order, so the DOM index maps to the data index. We nudge the
  // hit-test point toward the pie centre a few times so a tap that lands on a
  // label (which sits over the wedge) still resolves to its slice.
  function sectorIndexAt(clientX: number, clientY: number): number {
    const wrap = pieWrapRef.current;
    if (!wrap) return -1;
    const sectors = Array.from(wrap.querySelectorAll('.recharts-sector'));
    if (!sectors.length) return -1;
    const surf = wrap.querySelector('.recharts-surface') ?? wrap;
    const rect = surf.getBoundingClientRect();
    const ccx = rect.left + rect.width / 2;
    const ccy = rect.top + rect.height / 2;
    for (let f = 0; f <= 4; f++) {
      const t = f / 6;
      const el = document.elementFromPoint(clientX + (ccx - clientX) * t, clientY + (ccy - clientY) * t);
      const sector = el?.closest?.('.recharts-sector');
      if (sector) return sectors.indexOf(sector);
    }
    return -1;
  }

  // Our own tap handling (a plain pointer event, which fires reliably on iOS —
  // unlike recharts' SVG onClick). Ignores drags/scrolls via the small move
  // threshold, then runs the same single-tap-pill / double-tap-drill behaviour.
  function onPiePointerDown(e: React.PointerEvent) {
    tapStart.current = { x: e.clientX, y: e.clientY };
  }
  function onPiePointerUp(e: React.PointerEvent) {
    const s = tapStart.current;
    tapStart.current = null;
    if (!s) return;
    if (Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) > 12) return;
    const index = sectorIndexAt(e.clientX, e.clientY);
    if (index < 0) return;
    if (drill) {
      const sd = drillData[index];
      if (sd) setPicked({ name: sd.name, total: sd.total, color: sd.color });
      return;
    }
    const c = categorySummary[index];
    if (!c) return;
    const now = Date.now();
    const isSecond = lastClick.current.id === c.categoryId && now - lastClick.current.t < 350;
    lastClick.current = { id: c.categoryId, t: now };
    if (isSecond) {
      // Double-tap → drill into the sub-category breakdown.
      if (c.categoryId !== 'uncategorized') {
        setDrillId(c.categoryId);
        setPicked(null);
      }
    } else {
      // Single-tap → show the amount pill (tap the pill to drill).
      setPicked({ name: c.name, total: c.total, color: c.color, categoryId: c.categoryId });
    }
  }

  // Payment-method pie: same robust pointer hit-testing, single-tap shows the
  // amount pill (no drill).
  function onPmPointerDown(e: React.PointerEvent) {
    pmTapStart.current = { x: e.clientX, y: e.clientY };
  }
  function onPmPointerUp(e: React.PointerEvent) {
    const s = pmTapStart.current;
    pmTapStart.current = null;
    if (!s) return;
    if (Math.abs(e.clientX - s.x) + Math.abs(e.clientY - s.y) > 12) return;
    const wrap = pmWrapRef.current;
    if (!wrap) return;
    const sectors = Array.from(wrap.querySelectorAll('.recharts-sector'));
    if (!sectors.length) return;
    const surf = wrap.querySelector('.recharts-surface') ?? wrap;
    const rect = surf.getBoundingClientRect();
    const ccx = rect.left + rect.width / 2;
    const ccy = rect.top + rect.height / 2;
    let index = -1;
    for (let f = 0; f <= 4 && index < 0; f++) {
      const t = f / 6;
      const el = document.elementFromPoint(e.clientX + (ccx - e.clientX) * t, e.clientY + (ccy - e.clientY) * t);
      const sector = el?.closest?.('.recharts-sector');
      if (sector) index = sectors.indexOf(sector);
    }
    if (index < 0) return;
    const m = pmSummary[index];
    if (m) setPickedPm({ name: m.name, total: m.total, color: m.color });
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
              : 'Tap a slice for its amount · tap the amount to break it down.'}
          </p>

          <div className="pie__pickslot">
            {picked ? (
              (() => {
                const canDrill =
                  !drill &&
                  !!picked.categoryId &&
                  picked.categoryId !== 'uncategorized' &&
                  subcategories.some((s) => s.categoryId === picked.categoryId);
                return (
                  <button
                    type="button"
                    className={`pie__pick${canDrill ? ' pie__pick--drill' : ''}`}
                    style={{ background: tint(picked.color, 0.18), borderColor: picked.color }}
                    onClick={() => {
                      if (canDrill && picked.categoryId) {
                        setDrillId(picked.categoryId);
                        setPicked(null);
                      }
                    }}
                  >
                    <span className="pie__pick-dot" style={{ background: picked.color }} />
                    <span className="pie__pick-name">{picked.name}</span>
                    <strong style={{ color: picked.color }}>{formatINR(picked.total)}</strong>
                    {canDrill && <span className="pie__pick-drill">Breakdown ›</span>}
                  </button>
                );
              })()
            ) : (
              <span className="pie__hint">Tap a slice to see its amount</span>
            )}
          </div>

          <div className="pie__chart" ref={pieWrapRef} data-noswipe onPointerDown={onPiePointerDown} onPointerUp={onPiePointerUp}>
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
                >
                  {categorySummary.map((c) => (
                    <Cell key={c.categoryId} fill={c.color} style={{ cursor: 'pointer' }} />
                  ))}
                </Pie>
              )}
            </PieChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      {scoped.length > 0 && pmSummary.length > 0 && (
        <div className="card">
          <div className="pie__head">
            <h3>Spend by Payment Method</h3>
          </div>
          <p className="card__subtitle">Tap a slice for its amount. Untagged = no method set.</p>

          <div className="pie__pickslot">
            {pickedPm ? (
              <div
                className="pie__pick"
                style={{ background: tint(pickedPm.color, 0.18), borderColor: pickedPm.color }}
              >
                <span className="pie__pick-dot" style={{ background: pickedPm.color }} />
                <span className="pie__pick-name">{pickedPm.name}</span>
                <strong style={{ color: pickedPm.color }}>{formatINR(pickedPm.total)}</strong>
              </div>
            ) : (
              <span className="pie__hint">Tap a slice to see its amount</span>
            )}
          </div>

          <div className="pie__chart" ref={pmWrapRef} data-noswipe onPointerDown={onPmPointerDown} onPointerUp={onPmPointerUp}>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Pie
                  data={pmSummary}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={72}
                  label={pieLabel}
                  labelLine={false}
                  isAnimationActive={false}
                >
                  {pmSummary.map((m) => (
                    <Cell key={m.methodId || 'untagged'} fill={m.color} style={{ cursor: 'pointer' }} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="pmbreakdown">
            {pmSummary.map((m) => {
              const pct = scopeTotal > 0 ? Math.round((m.total / scopeTotal) * 100) : 0;
              return (
                <div className="barrow" key={m.methodId || 'untagged'}>
                  <div className="barrow__head barrow__head--static">
                    <span className="barrow__dot" style={{ background: m.color }} />
                    <span className="barrow__name">
                      {m.icon ? `${m.icon} ` : ''}
                      {m.name}
                    </span>
                    <span className="barrow__pct">{pct}%</span>
                    <span className="barrow__amt">{formatINR(m.total)}</span>
                  </div>
                  <div className="barrow__track">
                    <div className="barrow__fill" style={{ width: `${pct}%`, background: m.color }} />
                  </div>
                </div>
              );
            })}
          </div>
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
