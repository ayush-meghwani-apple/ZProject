import { useEffect, useRef, useState } from 'react';
import { formatINR, formatDate } from '../core/util';
import { getCategorySummary, totalSpend } from '../core/reports';
import { INVESTMENTS_CATEGORY_ID } from '../core/flatCategories';
import { ExpenseRepository } from '../repository/expenseRepository';
import { CategoryRepository } from '../repository/categoryRepository';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import CycleFilter, { filterByCycles, selectionLabel } from './CycleFilter';
import AppIcon from './AppIcon';
import type { Category, Expense, SalaryCycle } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
}

export default function Summary({ version }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const initialized = useRef(false);

  async function load() {
    const [nextExpenses, nextCategories, nextCycles] = await Promise.all([
      ExpenseRepository.getExpensesSorted(),
      CategoryRepository.getCategories(),
      SalaryCycleRepository.getCyclesSorted(),
    ]);
    setExpenses(nextExpenses);
    setCategories(nextCategories);
    setCycles(nextCycles);
    if (!initialized.current && nextCycles.length) {
      const current = nextCycles.find((cycle) => !cycle.endDate) ?? nextCycles[0];
      setSelected([current.id]);
      initialized.current = true;
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const scoped = filterByCycles(expenses, cycles, selected);
  const investments = scoped.filter((expense) => expense.categoryId === INVESTMENTS_CATEGORY_ID);
  const spending = scoped.filter((expense) => expense.categoryId !== INVESTMENTS_CATEGORY_ID);
  const spendingTotal = totalSpend(spending);
  const investmentTotal = totalSpend(investments);
  const categorySummary = getCategorySummary(spending, categories);

  return (
    <div className="page page--summary">
      <CycleFilter cycles={cycles} value={selected} onChange={setSelected} />

      <div className="card">
        <h3>{selectionLabel(cycles, selected)}</h3>
        <div className="stat">{formatINR(spendingTotal)}</div>
        <div className="stat--sub">{spending.length} expenses</div>
      </div>

      {investmentTotal > 0 && (
        <div className="card">
          <div className="row" style={{ padding: 0 }}>
            <span>
              <strong>📈 Investments &amp; Savings</strong>
              <span className="muted"> · excluded from spending</span>
            </span>
            <strong>{formatINR(investmentTotal)}</strong>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Category breakdown</h3>
        <p className="card__subtitle">Tap a category to see its expenses.</p>

        {categorySummary.length === 0 ? (
          <p className="muted">No expenses in this selection.</p>
        ) : (
          categorySummary.map((row) => {
            const category = categories.find((item) => item.id === row.categoryId);
            const open = expandedId === row.categoryId;
            const entries = spending
              .filter((expense) => (expense.categoryId ?? 'uncategorized') === row.categoryId)
              .sort((a, b) => b.date.localeCompare(a.date));
            const percentage = spendingTotal > 0 ? Math.round((row.total / spendingTotal) * 100) : 0;
            return (
              <div className="summarycat" key={row.categoryId}>
                <button
                  className="barrow__head"
                  onClick={() => setExpandedId(open ? null : row.categoryId)}
                >
                  <span className="barrow__dot" style={{ background: row.color }} />
                  <span className="barrow__name">
                    {category?.icon ? `${category.icon} ` : ''}
                    {row.name}
                  </span>
                  <span className="barrow__pct">{percentage}%</span>
                  <span className="barrow__amt">{formatINR(row.total)}</span>
                  <AppIcon name={open ? 'chevronUp' : 'chevronDown'} size={16} />
                </button>
                <div className="barrow__track">
                  <div
                    className="barrow__fill"
                    style={{ width: `${percentage}%`, background: row.color }}
                  />
                </div>
                {open && (
                  <div style={{ marginTop: 6 }}>
                    {entries.map((expense) => (
                      <div className="row" key={expense.id}>
                        <span>
                          <span>{expense.note || expense.rawText || 'Expense'}</span>
                          <span className="muted"> · {formatDate(expense.date)}</span>
                        </span>
                        <strong>{formatINR(expense.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
