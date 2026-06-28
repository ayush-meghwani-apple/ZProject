import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ExpenseRepository } from '../repository/expenseRepository';
import type { Category, Expense, Subcategory } from '../types/models';

function toDateInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** Apply a yyyy-mm-dd value while preserving the original time-of-day. */
function fromDateInput(value: string, originalIso: string): string {
  const time = new Date(originalIso);
  const d = new Date(`${value}T00:00:00`);
  d.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
  return d.toISOString();
}

interface Props {
  expense: Expense;
  categories: Category[];
  subcategories: Subcategory[];
  onClose: () => void;
  onSaved: () => void;
}

export default function EditExpenseModal({
  expense,
  categories,
  subcategories,
  onClose,
  onSaved,
}: Props) {
  const [amount, setAmount] = useState(String(expense.amount));
  const [categoryId, setCategoryId] = useState(expense.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(expense.subcategoryId ?? '');
  const [note, setNote] = useState(expense.note ?? '');
  const [date, setDate] = useState(toDateInput(expense.date));

  const subs = subcategories.filter((s) => s.categoryId === categoryId);

  async function save() {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      alert('Enter a valid amount.');
      return;
    }
    await ExpenseRepository.updateExpense({
      ...expense,
      amount: amt,
      categoryId: categoryId || undefined,
      subcategoryId: subcategoryId || undefined,
      note: note.trim() || undefined,
      date: fromDateInput(date, expense.date),
    });
    onSaved();
  }

  return createPortal(
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <h3>Edit Expense</h3>

        <label className="field">
          <span>Amount (₹)</span>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Category</span>
          <select
            className="select"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setSubcategoryId('');
            }}
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>

        {subs.length > 0 && (
          <label className="field">
            <span>Subcategory</span>
            <select
              className="select"
              value={subcategoryId}
              onChange={(e) => setSubcategoryId(e.target.value)}
            >
              <option value="">—</option>
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon ? `${s.icon} ${s.name}` : s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>Date</span>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Note</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
