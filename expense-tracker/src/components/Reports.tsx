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
  getCategorySummary,
  getDailyAverage,
  getMonthlyTotals,
  getSubcategorySummary,
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
  const [catId, setCatId] = useState<string>('');
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
  const monthly = getMonthlyTotals(scoped);
  const topExpenses = getTopExpenses(scoped, 5);
  const dailyAvg = getDailyAverage(scoped);

  const activeCatId = catId || categorySummary[0]?.categoryId || '';
  const subSummary = activeCatId
    ? getSubcategorySummary(scoped, subcategories, activeCatId)
    : [];

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
              <h3>Daily Average</h3>
              <div className="stat">{formatINR(dailyAvg)}</div>
              <div className="stat--sub">across active days</div>
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
            <h3>Category Breakdown</h3>
            <select
              className="select"
              value={activeCatId}
              onChange={(e) => setCatId(e.target.value)}
              style={{ marginBottom: 12 }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            {subSummary.length === 0 ? (
              <div className="muted">No expenses in this category for the selected cycles.</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={subSummary}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      label={(d) => d.name}
                    >
                      {subSummary.map((s) => (
                        <Cell key={s.subcategoryId} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatINR(v)} />
                  </PieChart>
                </ResponsiveContainer>
                {subSummary.map((s) => (
                  <div className="row" key={s.subcategoryId}>
                    <div className="row__left">
                      <span className="dot" style={{ background: s.color }} />
                      <span>{s.name}</span>
                      <span className="pill">{s.count}</span>
                    </div>
                    <span className="amount">{formatINR(s.total)}</span>
                  </div>
                ))}
              </>
            )}
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
