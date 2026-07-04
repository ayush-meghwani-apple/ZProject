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
import { formatINR, formatDate } from '../core/util';
import { ExpenseRepository } from '../repository/expenseRepository';
import { CategoryRepository } from '../repository/categoryRepository';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import CycleFilter, { filterByCycles, selectionLabel } from './CycleFilter';
import EditExpenseModal from './EditExpenseModal';
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
}/**
 * The single "Summary" tab: combines the at-a-glance totals + collapsible
 * category breakdown + recent expenses (formerly Dashboard) with the charts
 * (pie + monthly trend, formerly Reports), so there's one place to understand
 * your spending instead of two overlapping tabs.
 */
export default function Summary({ version, onChange }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drillId, setDrillId] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ name: string; total: number; color: string } | null>(null);
  const lastClick = useRef<{ id: string; t: number }>({ id: '', t: 0 });
  const pickTimer = useRef<number | undefined>(undefined);
  const initialized = useRef(false);

  // Dismiss the picked-slice amount when tapping anywhere that isn't a slice.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!(e.target as Element)?.closest?.('.recharts-sector')) {
        window.clearTimeout(pickTimer.current);
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

  function labelFor(e: Expense): string {
    const cat = categories.find((c) => c.id === e.categoryId);
    const sub = subcategories.find((s) => s.id === e.subcategoryId);
    const base = cat ? `${cat.icon} ${cat.name}` : '📦 Uncategorized';
    return sub ? `${base} › ${sub.icon ? sub.icon + ' ' : ''}${sub.name}` : base;
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense?')) return;
    await ExpenseRepository.deleteExpense(id);
    await load();
    onChange();
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
                ← All categories
              </button>
            )}
          </div>
          <p className="card__subtitle">
            {drill
              ? 'Sub-category breakdown.'
              : 'Tap a slice for its amount · double-tap to break it down.'}
          </p>

          <div className="pie__pickslot">
            {picked && (
              <div
                className="pie__pick"
                style={{ background: tint(picked.color, 0.18), borderColor: picked.color }}
              >
                <span className="pie__pick-dot" style={{ background: picked.color }} />
                <span className="pie__pick-name">{picked.name}</span>
                <strong style={{ color: picked.color }}>{formatINR(picked.total)}</strong>
              </div>
            )}
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              {drill ? (
                <Pie
                  data={drillData}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={88}
                  isAnimationActive={false}
                  label={(d) => d.name}
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
                  outerRadius={88}
                  isAnimationActive={false}
                  label={(d) => d.name}
                  onClick={(_, index) => {
                    const c = categorySummary[index];
                    if (!c) return;
                    const now = Date.now();
                    const isSecond =
                      lastClick.current.id === c.categoryId && now - lastClick.current.t < 350;
                    lastClick.current = { id: c.categoryId, t: now };
                    window.clearTimeout(pickTimer.current);
                    if (isSecond) {
                      // Double-tap → drill straight in, no amount flash.
                      if (c.categoryId !== 'uncategorized') {
                        setDrillId(c.categoryId);
                        setPicked(null);
                      }
                    } else {
                      // Single-tap → show the amount, but wait in case a second
                      // tap turns it into a drill.
                      pickTimer.current = window.setTimeout(
                        () => setPicked({ name: c.name, total: c.total, color: c.color }),
                        280,
                      );
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
                    {c.subs.length === 0 ? '' : open ? '▾' : '▸'}
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
                formatter={(v: number) => formatINR(v)}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155' }}
              />
              <Bar dataKey="total" fill="#38bdf8" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="card">
        <h3>Recent Expenses</h3>
        {scoped.length === 0 ? (
          <div className="muted">Nothing yet. Add one from the Add tab.</div>
        ) : (
          scoped.slice(0, 20).map((e) => (
            <div className="row" key={e.id}>
              <div className="row__left">
                <div style={{ minWidth: 0 }}>
                  <div>{labelFor(e)}</div>
                  <div className="muted">
                    {formatDate(e.date)}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
              </div>
              <div className="inline">
                <span className="amount">{formatINR(e.amount)}</span>
                <button className="iconbtn" onClick={() => setEditing(e)} title="Edit">
                  ✏️
                </button>
                <button className="iconbtn" onClick={() => handleDelete(e.id)} title="Delete">
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <EditExpenseModal
          expense={editing}
          categories={categories}
          subcategories={subcategories}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            onChange();
          }}
        />
      )}
    </div>
  );
}
