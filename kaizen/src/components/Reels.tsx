import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExpenseRepository } from '../repository/expenseRepository';
import { CategoryRepository } from '../repository/categoryRepository';
import { PaymentMethodRepository } from '../repository/paymentMethodRepository';
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
import CategoryMotion from './CategoryMotion';
import type { Alias, Category, Expense, PaymentMethod, SalaryCycle, Subcategory } from '../types/models';

interface Props {
  version: number;
  onChange: () => void;
}

// Remembers the reel index you were on, per cycle, so switching tabs and coming
// back to Reels returns you to where you left off (kept in memory for the app
// session).
const reelScrollPos: Record<string, number> = {};

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
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteAmt, setNoteAmt] = useState<Record<string, string>>({});
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [methodMenuFor, setMethodMenuFor] = useState<string | null>(null);
  const [categoryMenuFor, setCategoryMenuFor] = useState<string | null>(null);
  const [actionMenuFor, setActionMenuFor] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteEditingFor, setNoteEditingFor] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [remindExpense, setRemindExpense] = useState<Expense | null>(null);
  const [customVal, setCustomVal] = useState('');
  const [customUnit, setCustomUnit] = useState<'months' | 'years'>('months');
  const [addingNew, setAddingNew] = useState(false);
  const [toast, setToast] = useState('');
  const trackRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const changingCycle = useRef(false);

  function flashToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  }

  async function load() {
    const [e, c, s, a, cy, pm] = await Promise.all([
      ExpenseRepository.getExpensesSorted(),
      CategoryRepository.getCategories(),
      CategoryRepository.getSubcategories(),
      CategoryRepository.getAliases(),
      SalaryCycleRepository.getCyclesSorted(),
      PaymentMethodRepository.list(),
    ]);
    setExpenses(e);
    setCategories(c);
    setSubcategories(s);
    setAliases(a);
    setCycles(cy);
    setMethods(pm);
    setNotes(NotesRepository.getActive());

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

  // Close an open reel quick-edit menu when tapping elsewhere.
  useEffect(() => {
    if (!methodMenuFor && !categoryMenuFor && !actionMenuFor) return;
    function onDown(e: PointerEvent) {
      if (!(e.target as Element)?.closest?.('.reel__methodwrap, .reelcatpicker')) {
        setMethodMenuFor(null);
      }
      if (!(e.target as Element)?.closest?.('.reel__categorywrap, .reelcatpicker')) {
        setCategoryMenuFor(null);
      }
      if (!(e.target as Element)?.closest?.('.reel__actions')) setActionMenuFor(null);
    }
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [methodMenuFor, categoryMenuFor, actionMenuFor]);

  const reels = useMemo(() => {
    const list = cycleId ? expenses.filter((e) => e.salaryCycleId === cycleId) : expenses;
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, cycleId]);

  const total = useMemo(() => reels.reduce((sum, e) => sum + e.amount, 0), [reels]);

  // A permanent “salary credited” marker reel for a cycle started from a salary.
  const viewedCycle = cycles.find((c) => c.id === cycleId);
  const showSalary = !!viewedCycle?.autoSalary;
  const reelCount = notes.length + reels.length + (showSalary ? 1 : 0);
  const cycleIdx = cycles.findIndex((c) => c.id === cycleId);
  // cycles are sorted newest-first: older = higher index, newer = lower index.
  const hasOlder = cycles.length > 1 && cycleIdx >= 0;
  const hasNewer = cycles.length > 1 && cycleIdx > 0;
  const leadingTransition = hasNewer ? 1 : 0;

  // Return to the reel you were on for this cycle (or the top for a cycle you
  // haven't opened yet), once the track has a measurable height.
  useEffect(() => {
    if (!cycleId) return;
    const el = trackRef.current;
    if (!el) return;
    const target = Math.min(reelScrollPos[cycleId] ?? 0, Math.max(0, reelCount - 1));
    let timer = 0;
    const restore = () => {
      const h = el.clientHeight;
      if (h === 0) {
        timer = window.setTimeout(restore, 16);
        return;
      }
      el.scrollTo({ top: (target + leadingTransition) * h });
      setActive(target);
      changingCycle.current = false;
    };
    restore();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  function onScroll() {
    const el = trackRef.current;
    if (!el || el.clientHeight === 0) return;
    if (changingCycle.current) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (idx === 0 && leadingTransition) {
      changingCycle.current = true;
      goNewer();
      return;
    }
    const reelIdx = idx - leadingTransition;
    if (reelIdx >= reelCount && reelCount > 0) {
      changingCycle.current = true;
      goOlder(true);
      return;
    }
    if (cycleId) reelScrollPos[cycleId] = reelIdx;
    if (reelIdx !== active) {
      setActive(reelIdx);
      setMethodMenuFor(null);
      setActionMenuFor(null);
    }
  }

  function goOlder(fromReelEnd = false) {
    if (!hasOlder) return;
    changingCycle.current = true;
    const next = cycles[(cycleIdx + 1) % cycles.length];
    if (fromReelEnd) {
      reelScrollPos[next.id] = 0;
      trackRef.current?.scrollTo({ top: 0 });
    }
    setCycleId(next.id);
  }
  function goNewer() {
    if (!hasNewer) return;
    changingCycle.current = true;
    const next = cycles[cycleIdx - 1];
    setCycleId(next.id);
  }

  const cycleTitle = cycleIdx >= 0 ? cycleName(cycles[cycleIdx]) : 'All expenses';
  const categoryExpense = categoryMenuFor
    ? reels.find((expense) => expense.id === categoryMenuFor)
    : undefined;
  const methodExpense = methodMenuFor
    ? reels.find((expense) => expense.id === methodMenuFor)
    : undefined;

  function catFor(e: Expense): Category | undefined {
    return categories.find((c) => c.id === e.categoryId);
  }
  function subOf(e: Expense): Subcategory | undefined {
    return subcategories.find((x) => x.id === e.subcategoryId);
  }
  function methodOf(e: Expense): PaymentMethod | undefined {
    return e.paymentMethodId ? methods.find((m) => m.id === e.paymentMethodId) : undefined;
  }

  // Set/change the payment method straight from a reel (no need to open Edit).
  async function setExpenseMethod(exp: Expense, methodId: string) {
    await ExpenseRepository.updateExpense({
      ...exp,
      paymentMethodId: methodId || undefined,
      reviewed: exp.autoImported ? true : exp.reviewed,
    });
    setMethodMenuFor(null);
    await load();
    onChange();
  }

  async function setExpenseCategory(exp: Expense, categoryId: string) {
    await ExpenseRepository.updateExpense({
      ...exp,
      categoryId: categoryId || undefined,
      subcategoryId: undefined,
      reviewed: exp.autoImported ? true : exp.reviewed,
    });
    setCategoryMenuFor(null);
    await load();
    onChange();
  }

  async function saveExpenseNote(exp: Expense) {
    const note = (noteDrafts[exp.id] ?? exp.note ?? '').trim();
    setNoteEditingFor(null);
    if (note === (exp.note ?? '')) return;
    await ExpenseRepository.updateExpense({
      ...exp,
      note: note || undefined,
      reviewed: exp.autoImported ? true : exp.reviewed,
    });
    setNoteDrafts((current) => {
      const next = { ...current };
      delete next[exp.id];
      return next;
    });
    await load();
    onChange();
    flashToast(note ? 'Note saved' : 'Note removed');
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense?')) return;
    await ExpenseRepository.deleteExpense(id);
    await load();
    onChange();
  }

  async function verifyImported(e: Expense) {
    await ExpenseRepository.setReviewed(e.id, true);
    playSound('success');
    await load();
    onChange();
    flashToast('Imported expense verified');
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
        <div className="reels__toprow">
          <div className="reels__bar">
            <button
              className="reels__nav"
              onClick={() => goOlder()}
              disabled={!hasOlder}
              aria-label="Older cycle"
            >
              ‹
            </button>
            <div className="reels__cycle">
              <span className="reels__cycle-kicker">Spending cycle</span>
              <span className="reels__cycle-name">{cycleTitle}</span>
              <span className="reels__cycle-sub">
                {formatINR(total)} · {reels.length} expense{reels.length === 1 ? '' : 's'}
              </span>
            </div>
            <button
              className="reels__nav"
              onClick={() => goNewer()}
              disabled={!hasNewer}
              aria-label="Newer cycle"
            >
              ›
            </button>
          </div>
          {reelCount > 0 && (
            <div className="reels__counter">
              <strong>{Math.min(active + 1, reelCount)}</strong>
              <span>/ {reelCount}</span>
            </div>
          )}
        </div>
      </div>

      {reels.length === 0 && notes.length === 0 && !showSalary ? (
        <div className="reels__empty">
          <div className="reels__empty-emoji">🎞️</div>
          <p>No expenses in this cycle yet.</p>
          <p className="muted">Add some from the Add tab, then scroll them here.</p>
        </div>
      ) : (
        <>
          <div
            key={cycleId}
            className="reels__track"
            ref={trackRef}
            onScroll={onScroll}
          >
            {hasNewer && (
              <section className="reel reel--cycle-transition" aria-hidden="true">
                <AppIcon name="chevronUp" size={22} />
                <span>{cycleName(cycles[cycleIdx - 1])}</span>
              </section>
            )}
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

            {reels.map((e, expenseIndex) => {
              const cat = catFor(e);
              const color = cat?.color ?? '#6366f1';
              const sub = subOf(e);
              const method = methodOf(e);
              const isRecurring = !!e.recurringId; // auto-created from a recurring rule
              const needsVerification = !!e.autoImported && !e.reviewed;
              return (
                <section
                  className="reel"
                  key={e.id}
                  style={{
                    background: `radial-gradient(110% 78% at 50% 22%, ${tint(color, 0.38)} 0%, ${tint(color, 0.1)} 48%, transparent 74%)`,
                  }}
                >
                  <div className="reel__visual">
                    <CategoryMotion
                      categoryId={cat?.id}
                      color={color}
                      icon={cat?.icon ?? '📦'}
                      name={cat ? `${cat.name} category` : 'Uncategorized expense'}
                      active={active === notes.length + expenseIndex}
                    />
                  </div>

                  <div className="reel__content">
                    <div className="reel__amount">{formatINR(e.amount)}</div>

                    {noteEditingFor === e.id ? (
                      <form
                        className="reel__noteedit"
                        data-noswipe
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveExpenseNote(e);
                        }}
                      >
                        <input
                          className="input"
                          aria-label="Expense note"
                          autoFocus
                          placeholder="Add a note"
                          value={noteDrafts[e.id] ?? e.note ?? ''}
                          onChange={(event) =>
                            setNoteDrafts((current) => ({ ...current, [e.id]: event.target.value }))
                          }
                        />
                        <button className="btn btn--ghost" type="submit" aria-label="Save note">
                          <AppIcon name="done" size={16} />
                        </button>
                      </form>
                    ) : (
                      <button
                        className={`reel__noteread${e.note ? '' : ' reel__noteread--empty'}`}
                        data-noswipe
                        onClick={() => {
                          setNoteDrafts((current) => ({ ...current, [e.id]: e.note ?? '' }));
                          setNoteEditingFor(e.id);
                        }}
                      >
                        <AppIcon name="edit" size={14} />
                        <span>{e.note || 'Add note'}</span>
                      </button>
                    )}

                    <div className="reel__meta">
                      <div className="reel__categorywrap" data-noswipe>
                        <button
                          className={`reel__cat reel__catbtn${cat ? '' : ' reel__catbtn--missing'}`}
                          onClick={() => {
                            setMethodMenuFor(null);
                            setCategoryMenuFor(categoryMenuFor === e.id ? null : e.id);
                          }}
                          aria-label="Change category"
                        >
                          {cat ? `${cat.icon} ${cat.name}` : 'Choose category'}
                          <AppIcon name="chevronDown" size={14} />
                        </button>
                      </div>
                      {sub && <span className="reel__sub">{sub.icon ? `${sub.icon} ` : ''}{sub.name}</span>}
                      <span className="reel__date"><AppIcon name="calendar" size={13} /> {formatDate(e.date)}</span>
                      <div className="reel__methodwrap" data-noswipe>
                        <button
                          className={`reel__methodchip${method ? ' reel__methodchip--set' : ''}`}
                          onClick={() => {
                            setCategoryMenuFor(null);
                            setMethodMenuFor(methodMenuFor === e.id ? null : e.id);
                          }}
                          aria-label="Change payment method"
                        >
                          {method ? `${method.icon ? `${method.icon} ` : ''}${method.name}` : 'Payment method'}
                          <AppIcon name="chevronDown" size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="reel__source">
                      {isRecurring && <span><AppIcon name="recurring" size={12} /> Recurring</span>}
                      {needsVerification && (
                        <button onClick={() => verifyImported(e)}>
                          <AppIcon name="done" size={12} /> Imported · verify
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="reel__actions reel__actions--rail" data-noswipe>
                    <button className="reel__act reel__act--add" onClick={() => setAddingNew(true)} aria-label="Add expense" title="Add expense">
                      <AppIcon name="plus" size={20} />
                    </button>
                    <button className="reel__act reel__act--edit" onClick={() => setEditing(e)} aria-label="Edit expense" title="Edit expense">
                      <AppIcon name="edit" size={20} />
                    </button>
                    <button className="reel__act reel__act--rem" onClick={() => setRemindExpense(e)} aria-label="Remind me" title="Remind me">
                      <AppIcon name="remind" size={20} />
                    </button>
                    <button className="reel__act" onClick={() => setActionMenuFor(actionMenuFor === e.id ? null : e.id)} aria-label="More actions" title="More actions">
                      <span className="reel__moreicon">•••</span>
                    </button>
                    {actionMenuFor === e.id && (
                      <div className="reel__moremenu">
                        <button onClick={() => handleDelete(e.id)}>
                          <AppIcon name="trash" size={16} /> {e.autoImported ? 'Dismiss' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
            {showSalary && viewedCycle && (
              <section
                className="reel reel--reviewed"
                key={`salary-${viewedCycle.id}`}
                style={{
                  background:
                    'radial-gradient(130% 90% at 50% 0%, rgba(16, 185, 129, 0.4) 0%, rgba(16, 185, 129, 0.12) 45%, transparent 70%)',
                }}
              >
                <div className="reel__flame reel__flame--ok">💰 Salary credited</div>
                <div className="reel__visual">
                  <CategoryMotion
                    categoryId="salary"
                    color="#10b981"
                    icon="🎉"
                    name="Salary credited"
                    active={active === notes.length + reels.length}
                  />
                </div>
                <div className="reel__content">
                  <div className="reel__cat">Salary received — new cycle started</div>
                  <div className="reel__date">
                    <AppIcon name="calendar" size={14} /> {formatDate(viewedCycle.startDate)}
                  </div>
                </div>
                <div className="reel__actions reel__actions--rail" data-noswipe>
                  <button className="reel__act reel__act--add" onClick={() => setAddingNew(true)} aria-label="Add expense" title="Add expense">
                    <AppIcon name="plus" size={20} />
                  </button>
                </div>
              </section>
            )}
            {cycles.length > 1 && (
              <section className="reel reel--cycle-transition" aria-hidden="true">
                <AppIcon name="chevronDown" size={22} />
                <span>{cycleName(cycles[(cycleIdx + 1) % cycles.length])}</span>
              </section>
            )}
          </div>
        </>
      )}

      {toast && <div className="reels__toast">{toast}</div>}

      {categoryExpense && createPortal(
        <div className="modal__backdrop" onClick={() => setCategoryMenuFor(null)}>
          <div className="modal__card reelcatpicker" onClick={(event) => event.stopPropagation()}>
            <div className="reelcatpicker__head">
              <div>
                <h3>Choose category</h3>
                <p className="card__subtitle">{formatINR(categoryExpense.amount)}</p>
              </div>
              <button className="iconbtn" onClick={() => setCategoryMenuFor(null)} aria-label="Close category picker">×</button>
            </div>
            <div className="reelcatpicker__list">
              <button
                className={!categoryExpense.categoryId ? 'is-on' : ''}
                onClick={() => setExpenseCategory(categoryExpense, '')}
              >
                <span>📦</span> Uncategorized
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={category.id === categoryExpense.categoryId ? 'is-on' : ''}
                  onClick={() => setExpenseCategory(categoryExpense, category.id)}
                >
                  <span>{category.icon}</span> {category.name}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {methodExpense && createPortal(
        <div className="modal__backdrop" onClick={() => setMethodMenuFor(null)}>
          <div className="modal__card reelcatpicker" onClick={(event) => event.stopPropagation()}>
            <div className="reelcatpicker__head">
              <div>
                <h3>Choose payment method</h3>
                <p className="card__subtitle">{formatINR(methodExpense.amount)}</p>
              </div>
              <button className="iconbtn" onClick={() => setMethodMenuFor(null)} aria-label="Close payment method picker">×</button>
            </div>
            <div className="reelcatpicker__list">
              <button
                className={!methodExpense.paymentMethodId ? 'is-on' : ''}
                onClick={() => setExpenseMethod(methodExpense, '')}
              >
                <span>—</span> No method
              </button>
              {methods.map((method) => (
                <button
                  key={method.id}
                  className={method.id === methodExpense.paymentMethodId ? 'is-on' : ''}
                  onClick={() => setExpenseMethod(methodExpense, method.id)}
                >
                  <span>{method.icon || '💳'}</span> {method.name}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
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
          defaultPaymentMethodName="SBI Savings A/C"
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
