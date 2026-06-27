import { useEffect, useRef, useState } from 'react';
import { totalSpend, getCategorySummary } from '../core/reports';
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

export default function Dashboard({ version, onChange }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Expense | null>(null);
  const initialized = useRef(false);

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

    // Default the filter to the current (open) cycle, first load only.
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
  const topCategories = getCategorySummary(scoped, categories).slice(0, 5);

  function labelFor(e: Expense): string {
    const cat = categories.find((c) => c.id === e.categoryId);
    const sub = subcategories.find((s) => s.id === e.subcategoryId);
    const base = cat ? `${cat.icon} ${cat.name}` : '📦 Uncategorized';
    return sub ? `${base} › ${sub.name}` : base;
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

      <div className="card">
        <h3>Top Categories</h3>
        {topCategories.length === 0 ? (
          <div className="muted">No expenses yet.</div>
        ) : (
          topCategories.map((c) => (
            <div className="row" key={c.categoryId}>
              <div className="row__left">
                <span className="dot" style={{ background: c.color }} />
                <span>{c.name}</span>
                <span className="pill">{c.count}</span>
              </div>
              <span className="amount">{formatINR(c.total)}</span>
            </div>
          ))
        )}
      </div>

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
