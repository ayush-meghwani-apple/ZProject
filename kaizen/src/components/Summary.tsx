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
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function selectCategory(categoryId: string, toggle = false, revealChip = false) {
    setExpandedId((current) => (toggle && current === categoryId ? null : categoryId));
    if (revealChip) {
      requestAnimationFrame(() => {
        chipRefs.current[categoryId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      });
    }
  }

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
  const ringCircumference = 2 * Math.PI * 45;
  let ringOffset = 0;

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
              onClick={() => selectCategory(topCategory.categoryId, false, true)}
            >
              <span style={{ background: topCategory.color }} />
              Most spent on {topCategory.name}
              <AppIcon name="chevronRight" size={14} />
            </button>
          )}
        </div>
        <div className="summaryring" aria-label={`${categorySummary.length} spending categories`}>
          <svg className="summaryring__svg" viewBox="0 0 112 112" aria-hidden="true">
            <circle className="summaryring__track" cx="56" cy="56" r="45" />
            {categorySummary.map((row) => {
              const length = spendingTotal > 0 ? (row.total / spendingTotal) * ringCircumference : 0;
              const offset = ringOffset;
              ringOffset += length;
              const active = expandedId === row.categoryId;
              return (
                <circle
                  key={row.categoryId}
                  className={`summaryring__segment${active ? ' is-active' : ''}`}
                  cx="56"
                  cy="56"
                  r="45"
                  stroke={row.color}
                  strokeDasharray={`${length} ${ringCircumference - length}`}
                  strokeDashoffset={-offset}
                  onClick={() => selectCategory(row.categoryId, false, true)}
                />
              );
            })}
          </svg>
          <div className="summaryring__inner">
            <strong>{categorySummary.length}</strong>
            <span>categories</span>
          </div>
        </div>
        {categorySummary.length > 0 && (
          <div className="summaryhero__chips" aria-label="Spending categories" data-noswipe>
            {categorySummary.map((row) => {
              const category = categories.find((item) => item.id === row.categoryId);
              const active = expandedId === row.categoryId;
              const percentage = spendingTotal > 0 ? Math.round((row.total / spendingTotal) * 100) : 0;
              return (
                <button
                  key={row.categoryId}
                  ref={(element) => { chipRefs.current[row.categoryId] = element; }}
                  className={active ? 'is-active' : ''}
                  onClick={() => selectCategory(row.categoryId, true)}
                >
                  <span className="summaryhero__chipdot" style={{ background: row.color }} />
                  <span>{category?.icon ? `${category.icon} ` : ''}{row.name}</span>
                  <strong>{percentage}%</strong>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {investmentTotal > 0 && (
        <div className={`card summarycat savingscat${expandedId === INVESTMENTS_CATEGORY_ID ? ' summarycat--open' : ''}`}>
          <button
            className="barrow__head"
            onClick={() =>
              setExpandedId(expandedId === INVESTMENTS_CATEGORY_ID ? null : INVESTMENTS_CATEGORY_ID)
            }
          >
            <span className="barrow__dot" style={{ background: investmentCategory?.color ?? '#10b981' }} />
            <span className="barrow__name summarycat__label">
              <span>{investmentCategory?.icon ?? '📈'} {investmentCategory?.name ?? 'Savings'}</span>
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
          <div className="barrow__track">
            <div className="barrow__fill" style={{ width: '100%', background: investmentCategory?.color ?? '#10b981' }} />
          </div>
          {expandedId === INVESTMENTS_CATEGORY_ID && (
            <div className="summarycat__entries">
              {investments.map((expense) => (
                <div className="summaryentry" key={expense.id}>
                  <span>
                    <span>{expense.note || expense.rawText || 'Saving'}</span>
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
                  onClick={() => selectCategory(row.categoryId, true, true)}
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
