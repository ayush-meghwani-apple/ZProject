import { useEffect, useMemo, useRef, useState } from 'react';
import { ExpenseRepository } from '../repository/expenseRepository';
import { CategoryRepository } from '../repository/categoryRepository';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import { cycleName } from '../core/salaryCycle';
import { formatINR, formatDate } from '../core/util';
import { getPrefs } from '../core/preferences';
import EditExpenseModal from './EditExpenseModal';
import type { Category, Expense, SalaryCycle, Subcategory } from '../types/models';

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
  const [cycles, setCycles] = useState<SalaryCycle[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [active, setActive] = useState(0);
  const [bigThreshold, setBigThreshold] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className="reels">
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

      {reels.length === 0 ? (
        <div className="reels__empty">
          <div className="reels__empty-emoji">🎞️</div>
          <p>No expenses in this cycle yet.</p>
          <p className="muted">Add some from the Add tab, then scroll them here.</p>
        </div>
      ) : (
        <>
          <div className="reels__track" ref={trackRef} onScroll={onScroll}>
            {reels.map((e) => {
              const cat = catFor(e);
              const color = cat?.color ?? '#6366f1';
              const sub = subOf(e);
              const big = bigThreshold > 0 && e.amount >= bigThreshold;
              return (
                <section
                  className={`reel${big ? ' reel--big' : ''}`}
                  key={e.id}
                  style={{
                    background: big
                      ? 'radial-gradient(130% 90% at 50% 0%, rgba(244, 63, 94, 0.45) 0%, rgba(217, 70, 239, 0.18) 45%, transparent 70%)'
                      : `radial-gradient(120% 80% at 50% 0%, ${tint(color, 0.32)} 0%, transparent 60%)`,
                  }}
                >
                  {big && <div className="reel__flame">💸 Big spend!</div>}

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

                  {e.note ? (
                    <div className="reel__note">“{e.note}”</div>
                  ) : e.rawText ? (
                    <div className="reel__note reel__note--raw">{e.rawText}</div>
                  ) : null}

                  <div className="reel__actions">
                    <button className="btn btn--ghost" onClick={() => handleDelete(e.id)}>
                      🗑️ Delete
                    </button>
                    <button className="btn" onClick={() => setEditing(e)}>
                      ✏️ Edit
                    </button>
                  </div>
                </section>
              );
            })}
          </div>

          <div className="reels__counter">
            {Math.min(active + 1, reels.length)} / {reels.length}
          </div>
        </>
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
