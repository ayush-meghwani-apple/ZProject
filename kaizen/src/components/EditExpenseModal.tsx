import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExpenseRepository } from '../repository/expenseRepository';
import { PaymentMethodRepository } from '../repository/paymentMethodRepository';
import type { Category, Expense, PaymentMethod } from '../types/models';

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
  expense?: Expense;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  /** For a NEW expense, preselect this payment method (created if missing). */
  defaultPaymentMethodName?: string;
}

export default function EditExpenseModal({
  expense,
  categories,
  onClose,
  onSaved,
  defaultPaymentMethodName,
}: Props) {
  const isNew = !expense;
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? '');
  const [note, setNote] = useState(expense?.note ?? '');
  const [date, setDate] = useState(toDateInput(expense?.date ?? new Date().toISOString()));
  const [paymentMethodId, setPaymentMethodId] = useState(expense?.paymentMethodId ?? '');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);

  useEffect(() => {
    (async () => {
      let list = await PaymentMethodRepository.list();
      // New expense: default to the requested method (create it once if needed).
      if (isNew && !paymentMethodId && defaultPaymentMethodName) {
        let def = list.find(
          (m) => m.name.toLowerCase() === defaultPaymentMethodName.toLowerCase(),
        );
        if (!def) {
          def = await PaymentMethodRepository.add(defaultPaymentMethodName, '🏦');
          list = await PaymentMethodRepository.list();
        }
        setPaymentMethodId(def.id);
      }
      setMethods(list);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      alert('Enter a valid amount.');
      return;
    }
    if (isNew) {
      await ExpenseRepository.addExpense({
        amount: amt,
        categoryId: categoryId || undefined,
        paymentMethodId: paymentMethodId || undefined,
        note: note.trim() || undefined,
        date: fromDateInput(date, new Date().toISOString()),
      });
    } else {
      await ExpenseRepository.updateExpense({
        ...expense!,
        amount: amt,
        categoryId: categoryId || undefined,
        paymentMethodId: paymentMethodId || undefined,
        note: note.trim() || undefined,
        date: fromDateInput(date, expense!.date),
        reviewed: expense!.autoImported ? true : expense!.reviewed,
      });
    }
    onSaved();
  }

  return createPortal(
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <h3>{isNew ? 'Add Expense' : 'Edit Expense'}</h3>

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
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>

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
          <span>Payment method</span>
          <select
            className="select"
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
          >
            <option value="">— None —</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.icon ? `${m.icon} ${m.name}` : m.name}
              </option>
            ))}
          </select>
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
