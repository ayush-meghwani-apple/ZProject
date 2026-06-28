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
  countCycles,
  getCategoryBreakdown,
  getCategorySummary,
  getCycleAverage,
  getMonthlyTotals,
  getTopExpenses,
  totalSpend,
} from '../core/reports';
import { formatINR, formatDate } from '../core/util';
import { ExpenseRepository } from '../repository/expenseRepository';
import { CategoryRepository } from '../repository/categoryRepository';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import CycleFilter, { filterByCycles, selectionLabel } from './CycleFilter';
import type { Category, Expense, SalaryCycle, Subcategory } from '../types/models';

export default function Reports({ version }: { version: number }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    Promise.all([
      ExpenseRepository.getExpenses(),
      CategoryRepository.getCategories(),
      CategoryRepository.getSubcategories(),
      SalaryCycleRepository.getCyclesSorted(),
    ]).then(([e, c, s, cy]) => {
      setExpenses(e);
      setCategories(c);
      setSubcategories(s);
      setCycles(cy);
      if (!initialized.current && cy.length > 0) {
        const open = cy.find((x) => !x.endDate) ?? cy[0];
        setSelected([open.id]);
        initialized.current = true;
      }
    });
  }, [version]);

  const scoped = filterByCycles(expenses, cycles, selected);
  const categorySummary = getCategorySummary(scoped, categories);
  const breakdown = getCategoryBreakdown(scoped, categories, subcategories);
  const monthly = getMonthlyTotals(scoped);
  const topExpenses = getTopExpenses(scoped, 5);
  const cycleAvg = getCycleAverage(scoped);
  const nCycles = countCycles(scoped);

  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized';

  return (
    <div className="page">
      <CycleFilter cycles={cycles} value={selected} onChange={setSelected} />

      {scoped.length === 0 ? (
        <div className="empty">No expenses for {selectionLabel(cycles, selected)}.</div>
      ) : (
        <>
          <div className="grid-2">
            <div className="card">
              <h3>Spent ({selectionLabel(cycles, selected)})</h3>
              <div className="stat">{formatINR(totalSpend(scoped))}</div>
              <div className="stat--sub">{scoped.length} expenses</div>
            </div>
            <div className="card">
              <h3>Cycle Average</h3>
              <div className="stat">{formatINR(cycleAvg)}</div>
              <div className="stat--sub">across {nCycles} cycle{nCycles === 1 ? '' : 's'}</div>
            </div>
          </div>

          <div className="card">
            <h3>Spend by Category</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={categorySummary}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(d) => d.name}
                >
                  {categorySummary.map((c) => (
                    <Cell key={c.categoryId} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatINR(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3>All Categories &amp; Sub-categories</h3>
            <p className="card__subtitle">
              Full breakdown — every category and sub-category with its share, always expanded.
            </p>
            {breakdown.map((c) => {
              const pct =
                totalSpend(scoped) > 0 ? Math.round((c.total / totalSpend(scoped)) * 100) : 0;
              return (
                <div className="tree" key={c.categoryId}>
                  <div className="tree__cat">
                    <span className="dot" style={{ background: c.color }} />
                    <span className="tree__name">
                      {c.icon} {c.name}
                    </span>
                    <span className="barrow__pct">{pct}%</span>
                    <span className="amount">{formatINR(c.total)}</span>
                  </div>
                  <div className="barrow__track">
                    <div
                      className="barrow__fill"
                      style={{ width: `${pct}%`, background: c.color }}
                    />
                  </div>
                  {c.subs.map((s) => (
                    <div className="tree__sub" key={s.subcategoryId}>
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
              );
            })}
          </div>

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
                <Bar dataKey="total" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3>Top 5 Expenses</h3>
            {topExpenses.map((e) => (
              <div className="row" key={e.id}>
                <div className="row__left">
                  <div>
                    <div>{catName(e.categoryId)}</div>
                    <div className="muted">
                      {formatDate(e.date)}
                      {e.note ? ` · ${e.note}` : ''}
                    </div>
                  </div>
                </div>
                <span className="amount">{formatINR(e.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
