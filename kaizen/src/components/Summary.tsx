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

function categoryRing(rows: ReturnType<typeof getCategorySummary>, total: number): string {
  if (total <= 0 || rows.length === 0) return 'conic-gradient(var(--border) 0 100%)';
  let start = 0;
  const segments = rows.map((row) => {
    const end = start + (row.total / total) * 100;
    const segment = `${row.color} ${start}% ${end}%`;
    start = end;
    return segment;
  });
  return `conic-gradient(${segments.join(', ')})`;
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
  const investmentCategory = categories.find((category) => category.id === INVESTMENTS_CATEGORY_ID);
  const categorySummary = getCategorySummary(spending, categories);
  const topCategory = categorySummary[0];

  return (
    <div className="page page--summary">
      <CycleFilter cycles={cycles} value={selected} onChange={setSelected} />

      <div className="card summaryhero">
        <div className="summaryhero__copy">
          <span className="summaryhero__eyebrow">Total spending</span>
          <div className="summaryhero__amount">{formatINR(spendingTotal)}</div>
          <div className="summaryhero__period">
            {selectionLabel(cycles, selected)} · {spending.length} transaction{spending.length === 1 ? '' : 's'}
          </div>
          {topCategory && (
            <button
              className="summaryhero__insight"
              onClick={() => setExpandedId(topCategory.categoryId)}
            >
              <span style={{ background: topCategory.color }} />
              Most spent on {topCategory.name}
              <AppIcon name="chevronRight" size={14} />
            </button>
          )}
        </div>
        <div
          className="summaryring"
          style={{ background: categoryRing(categorySummary, spendingTotal) }}
          aria-label={`${categorySummary.length} spending categories`}
        >
          <div className="summaryring__inner">
            <strong>{categorySummary.length}</strong>
            <span>categories</span>
          </div>
        </div>
      </div>

      {investmentTotal > 0 && (
        <div className="card">
          <button
            className="barrow__head"
            onClick={() =>
              setExpandedId(expandedId === INVESTMENTS_CATEGORY_ID ? null : INVESTMENTS_CATEGORY_ID)
            }
          >
            <span className="barrow__name summarycat__label">
              <span>{investmentCategory?.icon ?? '📈'} Investments &amp; Savings</span>
              <small>
                Excluded from spending · {investments.length} transaction{investments.length === 1 ? '' : 's'}
              </small>
            </span>
            <span className="barrow__amt">{formatINR(investmentTotal)}</span>
            <AppIcon
              name={expandedId === INVESTMENTS_CATEGORY_ID ? 'chevronUp' : 'chevronDown'}
              size={16}
            />
          </button>
          {expandedId === INVESTMENTS_CATEGORY_ID && (
            <div style={{ marginTop: 6 }}>
              {investments.map((expense) => (
                <div className="row" key={expense.id}>
                  <span>
                    <span>{expense.note || expense.rawText || 'Investment or saving'}</span>
                    <span className="muted"> · {formatDate(expense.date)}</span>
                  </span>
                  <strong>{formatINR(expense.amount)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Where it went</h3>
        <p className="card__subtitle">Tap any category for its transactions.</p>

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
              <div className={`summarycat${open ? ' summarycat--open' : ''}`} key={row.categoryId}>
                <button
                  className="barrow__head"
                  onClick={() => setExpandedId(open ? null : row.categoryId)}
                >
                  <span className="barrow__dot" style={{ background: row.color }} />
                  <span className="barrow__name summarycat__label">
                    <span>{category?.icon ? `${category.icon} ` : ''}{row.name}</span>
                    <small>{row.count} transaction{row.count === 1 ? '' : 's'}</small>
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
                  <div className="summarycat__entries">
                    {entries.map((expense) => (
                      <div className="summaryentry" key={expense.id}>
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
