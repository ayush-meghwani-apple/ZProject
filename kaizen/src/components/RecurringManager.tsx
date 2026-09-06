import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import CollapsibleCard from './CollapsibleCard';
import { CategoryRepository } from '../repository/categoryRepository';
import { RecurringRepository } from '../repository/recurringRepository';
import { formatINR, formatDate } from '../core/util';
import AppIcon from './AppIcon';
import type {
  Category,
  RecurringExpense,
  RecurringFrequency,
} from '../types/models';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  version: number;
  onChange: () => void;
}

export default function RecurringManager({ version, onChange }: Props) {
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [amount, setAmount] = useState('');
  const [icon, setIcon] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);

  async function load() {
    const [recs, cats] = await Promise.all([
      RecurringRepository.getAll(),
      CategoryRepository.getCategories(),
    ]);
    setItems(recs.sort((a, b) => a.nextDate.localeCompare(b.nextDate)));
    setCategories(cats);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  function categoryFor(r: RecurringExpense): Category | undefined {
    return categories.find((category) => category.id === r.categoryId);
  }

  function scheduleText(r: RecurringExpense): string {
    if (r.frequency === 'daily') return 'every day';
    if (r.frequency === 'weekly') return `every ${WEEKDAYS[r.dayOfWeek ?? 0]}`;
    return `monthly on day ${r.dayOfMonth ?? 1}`;
  }

  function openAdd() {
    setEditing(null);
    setAmount('');
    setIcon('');
    setCategoryId('');
    setNote('');
    setFrequency('monthly');
    setDayOfMonth('1');
    setDayOfWeek('1');
    setEditorOpen(true);
  }

  function openEdit(item: RecurringExpense) {
    setEditing(item);
    setAmount(String(item.amount));
    setIcon(item.icon ?? '');
    setCategoryId(item.categoryId ?? '');
    setNote(item.note ?? '');
    setFrequency(item.frequency);
    setDayOfMonth(String(item.dayOfMonth ?? 1));
    setDayOfWeek(String(item.dayOfWeek ?? 1));
    setEditorOpen(true);
  }

  async function save() {
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      alert('Enter an amount greater than zero.');
      return;
    }
    const input = {
      amount: amt,
      icon: icon.trim() || undefined,
      categoryId: categoryId || undefined,
      note: note.trim() || undefined,
      frequency,
      dayOfWeek: frequency === 'weekly' ? Number(dayOfWeek) : undefined,
      dayOfMonth: frequency === 'monthly' ? Number(dayOfMonth) : undefined,
    };
    if (editing) await RecurringRepository.updateDetails(editing, input);
    else await RecurringRepository.add(input);
    setEditorOpen(false);
    setEditing(null);
    await RecurringRepository.runDue();
    await load();
    onChange();
  }

  async function toggle(id: string) {
    await RecurringRepository.toggle(id);
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this recurring expense?')) return;
    await RecurringRepository.remove(id);
    await load();
  }

  return (
    <CollapsibleCard title="Recurring Expenses" icon="recurring" compact>
      <div className="recur__toolbar">
        <span className="recur__count">{items.length} scheduled</span>
        <button className="btn btn--sm" onClick={openAdd}>
          <AppIcon name="plus" size={15} /> Add new
        </button>
      </div>

      {items.length > 0 && (
        <div className="recur-list">
          {items.map((r) => {
            const category = categoryFor(r);
            return (
              <article className={`recur-item${r.active ? '' : ' recur-item--paused'}`} key={r.id}>
                <span className="recur-item__icon" style={{ background: category?.color }}>
                  {r.icon || category?.icon || '📦'}
                </span>
                <div className="recur-item__copy">
                  <strong>{r.note || category?.name || 'Recurring expense'}</strong>
                  <span>{category?.name ?? 'Uncategorized'} · {scheduleText(r)}</span>
                  <small>Next {formatDate(r.nextDate)}{!r.active ? ' · Paused' : ''}</small>
                </div>
                <div className="recur-item__side">
                  <strong className="amount">{formatINR(r.amount)}</strong>
                  <div className="recur-item__actions">
                    <button
                      className="iconbtn"
                      onClick={() => openEdit(r)}
                      title="Edit"
                      aria-label={`Edit ${r.note || category?.name || 'recurring expense'}`}
                    >
                      <AppIcon name="edit" size={16} />
                    </button>
                    <button
                      className="iconbtn"
                      onClick={() => toggle(r.id)}
                      title={r.active ? 'Pause' : 'Resume'}
                      aria-label={`${r.active ? 'Pause' : 'Resume'} ${r.note || category?.name || 'recurring expense'}`}
                    >
                      {r.active ? <AppIcon name="pause" size={16} /> : <AppIcon name="play" size={16} />}
                    </button>
                    <button
                      className="iconbtn"
                      onClick={() => remove(r.id)}
                      title="Delete"
                      aria-label={`Delete ${r.note || category?.name || 'recurring expense'}`}
                    >
                      <AppIcon name="trash" size={16} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editorOpen && createPortal(
        <div className="modal__backdrop modal__backdrop--form" onClick={() => setEditorOpen(false)}>
          <div className="modal__card formdrawer" onClick={(event) => event.stopPropagation()}>
            <div className="formdrawer__head">
              <div>
                <h3>{editing ? 'Edit recurring expense' : 'New recurring expense'}</h3>
              </div>
              <button className="iconbtn" onClick={() => setEditorOpen(false)} aria-label="Close recurring editor">
                <AppIcon name="close" size={18} />
              </button>
            </div>
            <div className="recur-form__grid">
              <label className="field recur-form__icon">
                <span>Icon</span>
                <input className="input" aria-label="Recurring expense icon" placeholder="✨" value={icon} onChange={(event) => setIcon(event.target.value)} maxLength={8} />
              </label>
              <label className="field recur-form__amount">
                <span>Amount</span>
                <input className="input" type="number" inputMode="decimal" placeholder="₹ 0" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus />
              </label>
              <label className="field recur-form__wide">
                <span>Note</span>
                <input className="input" placeholder="e.g. Rent" value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <label className="field recur-form__wide">
                <span>Category</span>
                <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Uncategorized</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Frequency</span>
                <select className="select" value={frequency} onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              {frequency === 'monthly' && (
                <label className="field">
                  <span>Day of month</span>
                  <input className="input" type="number" inputMode="numeric" min={1} max={31} value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} />
                </label>
              )}
              {frequency === 'weekly' && (
                <label className="field">
                  <span>Weekday</span>
                  <select className="select" value={dayOfWeek} onChange={(event) => setDayOfWeek(event.target.value)}>
                    {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setEditorOpen(false)}>Cancel</button>
              <button className="btn" onClick={save}>{editing ? 'Save changes' : 'Add recurring'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </CollapsibleCard>
  );
}
