import { useEffect, useState } from 'react';
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
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [dayOfWeek, setDayOfWeek] = useState('1');

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

  function labelFor(r: RecurringExpense): string {
    const cat = categories.find((c) => c.id === r.categoryId);
    if (cat) return `${cat.icon} ${cat.name}`;
    return '📦 Uncategorized';
  }

  function scheduleText(r: RecurringExpense): string {
    if (r.frequency === 'daily') return 'every day';
    if (r.frequency === 'weekly') return `every ${WEEKDAYS[r.dayOfWeek ?? 0]}`;
    return `monthly on day ${r.dayOfMonth ?? 1}`;
  }

  async function add() {
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      alert('Enter an amount greater than zero.');
      return;
    }
    await RecurringRepository.add({
      amount: amt,
      categoryId: categoryId || undefined,
      note: note.trim() || undefined,
      frequency,
      dayOfWeek: frequency === 'weekly' ? Number(dayOfWeek) : undefined,
      dayOfMonth: frequency === 'monthly' ? Number(dayOfMonth) : undefined,
    });
    setAmount('');
    setNote('');
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
    <CollapsibleCard title="Recurring Expenses">
      <div className="muted" style={{ marginBottom: 12 }}>
        Auto-adds fixed expenses (like rent) on a schedule. Due items are created
        when you open the app; edit the date later on the expense itself.
      </div>

      {items.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {items.map((r) => (
            <div className="row" key={r.id}>
              <div className="row__left">
                <div style={{ minWidth: 0 }}>
                  <div>
                    {labelFor(r)}
                    {r.note ? ` · ${r.note}` : ''}
                  </div>
                  <div className="muted">
                    {scheduleText(r)} · next {formatDate(r.nextDate)}
                    {!r.active ? ' · paused' : ''}
                  </div>
                </div>
              </div>
              <div className="inline">
                <span className="amount">{formatINR(r.amount)}</span>
                <button
                  className="iconbtn"
                  onClick={() => toggle(r.id)}
                  title={r.active ? 'Pause' : 'Resume'}
                >
                  {r.active ? <AppIcon name="pause" size={16} /> : <AppIcon name="play" size={16} />}
                </button>
                <button className="iconbtn" onClick={() => remove(r.id)} title="Delete">
                  <AppIcon name="trash" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="recur-form">
        <div className="inline">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className="input"
            placeholder="Note (e.g. Rent)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="inline">
          <select
            className="select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">— Category —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="inline">
          <select
            className="select"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          {frequency === 'monthly' && (
            <input
              className="input"
              type="number"
              min={1}
              max={31}
              placeholder="Day (1-31)"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
            />
          )}
          {frequency === 'weekly' && (
            <select
              className="select"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </div>
        <button className="btn" onClick={add}>
          Add recurring
        </button>
      </div>
    </CollapsibleCard>
  );
}
