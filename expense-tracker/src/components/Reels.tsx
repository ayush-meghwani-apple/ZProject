import { useEffect, useMemo, useRef, useState } from 'react';
import { ExpenseRepository } from '../repository/expenseRepository';
import { CategoryRepository } from '../repository/categoryRepository';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import { NotesRepository, type Note } from '../repository/notesRepository';
import { RemindersRepository } from '../repository/remindersRepository';
import { parseInput } from '../core/parser';
import { cycleName } from '../core/salaryCycle';
import { formatINR, formatDate, addMonths } from '../core/util';
import { getPrefs, setPrefs } from '../core/preferences';
import { playSound } from '../core/sound';
import { requestNotificationPermission } from '../core/notify';
import EditExpenseModal from './EditExpenseModal';
import AppIcon from './AppIcon';
import type { Alias, Category, Expense, SalaryCycle, Subcategory } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
}

/** Translucent version of a hex colour, for the card background wash. */
function tint(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(99, 102, 241, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function Reels({ version, onChange }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteAmt, setNoteAmt] = useState<Record<string, string>>({});
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [active, setActive] = useState(0);
  const [bigThreshold, setBigThreshold] = useState(0);
  const [remindExpense, setRemindExpense] = useState<Expense | null>(null);
  const [customVal, setCustomVal] = useState('');
  const [customUnit, setCustomUnit] = useState<'months' | 'years'>('months');
  const [addingNew, setAddingNew] = useState(false);
  const [toast, setToast] = useState('');
  const trackRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  function flashToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  }

  async function load() {
    const [e, c, s, a, cy] = await Promise.all([
      ExpenseRepository.getExpensesSorted(),
      CategoryRepository.getCategories(),
      CategoryRepository.getSubcategories(),
      CategoryRepository.getAliases(),
      SalaryCycleRepository.getCyclesSorted(),
    ]);
    setExpenses(e);
    setCategories(c);
    setSubcategories(s);
    setAliases(a);
    setCycles(cy);
    setNotes(NotesRepository.getActive());
    setBigThreshold(getPrefs().bigExpenseThreshold);

    // Default to the current (open) cycle on first load.
    if (!initialized.current && cy.length > 0) {
      const open = cy.find((x) => !x.endDate) ?? cy[0];
      setCycleId(open.id);
      initialized.current = true;
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const reels = useMemo(() => {
    const list = cycleId ? expenses.filter((e) => e.salaryCycleId === cycleId) : expenses;
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, cycleId]);

  const total = useMemo(() => reels.reduce((sum, e) => sum + e.amount, 0), [reels]);

  // Reset to the top whenever the chosen cycle changes.
  useEffect(() => {
    setActive(0);
    trackRef.current?.scrollTo({ top: 0 });
  }, [cycleId]);

  function onScroll() {
    const el = trackRef.current;
    if (!el || el.clientHeight === 0) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (idx !== active) setActive(idx);
  }

  const cycleIdx = cycles.findIndex((c) => c.id === cycleId);
  // cycles are sorted newest-first: older = higher index, newer = lower index.
  const hasOlder = cycleIdx >= 0 && cycleIdx < cycles.length - 1;
  const hasNewer = cycleIdx > 0;
  function goOlder() {
    if (hasOlder) setCycleId(cycles[cycleIdx + 1].id);
  }
  function goNewer() {
    if (hasNewer) setCycleId(cycles[cycleIdx - 1].id);
  }

  const cycleTitle = cycleIdx >= 0 ? cycleName(cycles[cycleIdx]) : 'All expenses';

  function catFor(e: Expense): Category | undefined {
    return categories.find((c) => c.id === e.categoryId);
  }
  function subOf(e: Expense): Subcategory | undefined {
    return subcategories.find((x) => x.id === e.subcategoryId);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense?')) return;
    await ExpenseRepository.deleteExpense(id);
    await load();
    onChange();
  }

  async function toggleReviewed(e: Expense) {
    const next = !e.reviewed;
    await ExpenseRepository.setReviewed(e.id, next);
    playSound(next ? 'success' : 'note');
    await load();
    onChange();
  }

  // Turn a note into an expense: parse "<amount> <note text>" so any category /
  // sub-category mentioned in the note is picked up automatically.
  async function addExpenseFromNote(note: Note) {
    const amt = (noteAmt[note.id] ?? '').trim();
    if (!amt) {
      alert('Enter an amount first.');
      return;
    }
    const cmd = parseInput(`${amt} ${note.text}`, aliases, categories, subcategories);
    if (cmd.kind !== 'expense') {
      alert('Could not read an amount for this note. Try a number like 200.');
      return;
    }
    await ExpenseRepository.addExpense({
      amount: cmd.amount,
      categoryId: cmd.categoryId,
      subcategoryId: cmd.subcategoryId,
      note: cmd.note,
      rawText: note.text,
    });
    playSound(cmd.categoryId ? 'success' : 'uncategorized');
    NotesRepository.setDone(note.id, true);
    setNoteAmt((m) => ({ ...m, [note.id]: '' }));
    await load();
    onChange();
  }

  // Create a reminder to add this same expense again after `months` months.
  async function remindIn(e: Expense, months: number) {
    const cat = catFor(e);
    const sub = subOf(e);
    const parts = [String(e.amount)];
    if (cat) parts.push(cat.name);
    if (sub) parts.push(sub.name);
    const rawText = parts.join(' ');
    const label = `${cat?.icon ?? '📦'} ${cat?.name ?? 'Expense'}${sub ? ` › ${sub.name}` : ''}`;
    RemindersRepository.add({
      kind: 'reexpense',
      label,
      rawText,
      amount: e.amount,
      dueAt: addMonths(new Date(), months).toISOString(),
      sourceExpenseId: e.id,
    });
    setRemindExpense(null);
    setCustomVal('');
    const whenLabel =
      months % 12 === 0 ? `${months / 12} year${months === 12 ? '' : 's'}` : `${months} months`;
    flashToast(`⏰ Reminder set for ${whenLabel}`);
    // Best-effort: enable notifications now that there's something to notify about.
    if (!getPrefs().reminderNotifications) {
      const ok = await requestNotificationPermission();
      if (ok) setPrefs({ reminderNotifications: true });
    }
  }

  function remindCustom() {
    if (!remindExpense) return;
    const n = parseInt(customVal, 10);
    if (!Number.isFinite(n) || n <= 0) {
      flashToast('Enter a number of months/years');
      return;
    }
    remindIn(remindExpense, customUnit === 'years' ? n * 12 : n);
  }

  function markNoteDone(note: Note) {
    NotesRepository.setDone(note.id, true);
    setNotes(NotesRepository.getActive());
    onChange();
  }

  function deleteNote(note: Note) {
    if (!confirm('Delete this note?')) return;
    NotesRepository.remove(note.id);
    setNotes(NotesRepository.getActive());
    onChange();
  }

  return (
    <div className="reels">
      <div className="reels__top">
        <div className="reels__bar">
          <button
            className="reels__nav"
            onClick={goOlder}
            disabled={!hasOlder}
            aria-label="Older cycle"
          >
            ‹
          </button>
          <div className="reels__cycle">
            <span className="reels__cycle-name">{cycleTitle}</span>
            <span className="reels__cycle-sub">
              {formatINR(total)} · {reels.length} expense{reels.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            className="reels__nav"
            onClick={goNewer}
            disabled={!hasNewer}
            aria-label="Newer cycle"
          >
            ›
          </button>
        </div>
        {notes.length + reels.length > 0 && (
          <div className="reels__counter">
            {Math.min(active + 1, notes.length + reels.length)} / {notes.length + reels.length}
          </div>
        )}
      </div>

      {reels.length === 0 && notes.length === 0 ? (
        <div className="reels__empty">
          <div className="reels__empty-emoji">🎞️</div>
          <p>No expenses in this cycle yet.</p>
          <p className="muted">Add some from the Add tab, then scroll them here.</p>
        </div>
      ) : (
        <>
          <div className="reels__track" ref={trackRef} onScroll={onScroll}>
            {notes.map((n) => (
              <section className="reel reel--note" key={`note-${n.id}`}>
                <div className="reel__flame reel__flame--note">📝 Note</div>

                <div className="reel__note-text">{n.text}</div>

                <div className="reel__note-add">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    placeholder="₹ amount"
                    value={noteAmt[n.id] ?? ''}
                    onChange={(e) => setNoteAmt((m) => ({ ...m, [n.id]: e.target.value }))}
                  />
                  <button className="btn" onClick={() => addExpenseFromNote(n)}>
                    <AppIcon name="plus" size={16} /> Add expense
                  </button>
                </div>

                <div className="reel__actions">
                  <button className="btn btn--ghost" onClick={() => deleteNote(n)}>
                    <AppIcon name="trash" size={16} /> Delete
                  </button>
                  <button className="btn btn--ghost" onClick={() => markNoteDone(n)}>
                    <AppIcon name="done" size={16} /> Done
                  </button>
                </div>
              </section>
            ))}

            {reels.map((e) => {
              const cat = catFor(e);
              const color = cat?.color ?? '#6366f1';
              const sub = subOf(e);
              const isBig = bigThreshold > 0 && e.amount >= bigThreshold;
              const big = isBig && !e.reviewed; // “hot” only until reviewed
              const reviewed = isBig && !!e.reviewed; // acknowledged → calm green
              const isRecurring = !!e.recurringId; // auto-created from a recurring rule
              const cls = `reel${big ? ' reel--big' : ''}${reviewed ? ' reel--reviewed' : ''}`;
              return (
                <section
                  className={cls}
                  key={e.id}
                  style={{
                    background: big
                      ? 'radial-gradient(130% 90% at 50% 0%, rgba(244, 63, 94, 0.45) 0%, rgba(217, 70, 239, 0.18) 45%, transparent 70%)'
                      : reviewed
                        ? 'radial-gradient(130% 90% at 50% 0%, rgba(16, 185, 129, 0.34) 0%, rgba(16, 185, 129, 0.1) 45%, transparent 70%)'
                        : `radial-gradient(120% 80% at 50% 0%, ${tint(color, 0.32)} 0%, transparent 60%)`,
                  }}
                >
                  {big && <div className="reel__flame">💸 Big spend!</div>}
                  {reviewed && <div className="reel__flame reel__flame--ok">✅ Reviewed</div>}

                  <div className="reel__icon" style={{ background: tint(color, 0.18) }}>
                    {cat?.icon ?? '📦'}
                  </div>

                  <div className="reel__amount">{formatINR(e.amount)}</div>

                  <div className="reel__cat">{cat?.name ?? 'Uncategorized'}</div>
                  {sub && (
                    <span className="reel__sub" style={{ borderColor: tint(color, 0.5) }}>
                      {sub.icon ? `${sub.icon} ` : ''}{sub.name}
                    </span>
                  )}

                  <div className="reel__date">{formatDate(e.date)}</div>

                  {isRecurring && (
                    <div className="reel__recurring" title="Created automatically from a recurring rule">
                      <AppIcon name="recurring" size={13} /> Recurring
                    </div>
                  )}

                  {e.note ? (
                    <div className="reel__note">“{e.note}”</div>
                  ) : !isRecurring && e.rawText ? (
                    <div className="reel__note reel__note--raw">{e.rawText}</div>
                  ) : null}

                  <div className="reel__actions">
                    <button className="reel__act" onClick={() => handleDelete(e.id)}>
                      <AppIcon name="trash" size={17} /> <span>Delete</span>
                    </button>
                    {isBig && (
                      <button className="reel__act" onClick={() => toggleReviewed(e)}>
                        {e.reviewed ? <AppIcon name="undo" size={17} /> : <AppIcon name="reviewed" size={17} />} <span>{e.reviewed ? 'Unreview' : 'Reviewed'}</span>
                      </button>
                    )}
                    <button className="reel__act" onClick={() => setRemindExpense(e)}>
                      <AppIcon name="remind" size={17} /> <span>Remind</span>
                    </button>
                    <button className="reel__act" onClick={() => setEditing(e)}>
                      <AppIcon name="edit" size={17} /> <span>Edit</span>
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {toast && <div className="reels__toast">{toast}</div>}

      {!addingNew && !remindExpense && !editing && (
        <button
          className="reels__fab"
          onClick={() => setAddingNew(true)}
          aria-label="Add an expense"
        >
          ＋
        </button>
      )}

      {remindExpense && (
        <div className="modal__backdrop" onClick={() => setRemindExpense(null)}>
          <div className="modal__card" onClick={(e) => e.stopPropagation()}>
            <h3>⏰ Remind me to add this again</h3>
            <p className="card__subtitle">
              You'll be nudged in the 🔔 inbox (and a phone notification when the app is open).
            </p>
            <div className="remind__opts">
              {[
                { l: '1 month', m: 1 },
                { l: '3 months', m: 3 },
                { l: '6 months', m: 6 },
                { l: '1 year', m: 12 },
                { l: '2 years', m: 24 },
              ].map((o) => (
                <button
                  key={o.m}
                  className="btn btn--ghost remind__opt"
                  onClick={() => remindIn(remindExpense, o.m)}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <div className="remind__custom">
              <span className="muted">Custom</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="9"
                value={customVal}
                onChange={(e) => setCustomVal(e.target.value)}
              />
              <select
                className="input"
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value as 'months' | 'years')}
              >
                <option value="months">months</option>
                <option value="years">years</option>
              </select>
              <button className="btn" onClick={remindCustom}>
                Set
              </button>
            </div>
            <button
              className="btn btn--ghost"
              style={{ width: '100%', marginTop: 14 }}
              onClick={() => setRemindExpense(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {addingNew && (
        <EditExpenseModal
          categories={categories}
          subcategories={subcategories}
          onClose={() => setAddingNew(false)}
          onSaved={async () => {
            setAddingNew(false);
            playSound('success');
            await load();
            onChange();
          }}
        />
      )}

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
