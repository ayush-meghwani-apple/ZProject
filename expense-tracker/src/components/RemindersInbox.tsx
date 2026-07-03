import { useEffect, useState } from 'react';
import { RemindersRepository, type Reminder } from '../repository/remindersRepository';
import { ExpenseRepository } from '../repository/expenseRepository';
import { CategoryRepository } from '../repository/categoryRepository';
import { parseInput } from '../core/parser';
import { formatINR, formatDate } from '../core/util';
import { getPrefs, setPrefs } from '../core/preferences';
import { playSound } from '../core/sound';
import {
  notificationPermission,
  requestNotificationPermission,
} from '../core/notify';
import type { Alias, Category, Subcategory } from '../types/models';

interface Props {
  onClose: () => void;
  /** An expense was created → tell Expensify to reload. */
  onDataChanged: () => void;
  /** Jump to the Reels tab (used by the weekly review nudge). */
  onOpenReels: () => void;
  /** Reminder counts changed → refresh the header badge. */
  onCountsChanged: () => void;
}

/** Days between now and an ISO date, rounded (negative = overdue). */
function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function dueLabel(iso: string): string {
  const d = daysUntil(iso);
  if (d <= 0) return 'Due now';
  if (d === 1) return 'in 1 day';
  if (d < 30) return `in ${d} days`;
  const m = Math.round(d / 30);
  return m === 1 ? 'in ~1 month' : `in ~${m} months`;
}

export default function RemindersInbox({
  onClose,
  onDataChanged,
  onOpenReels,
  onCountsChanged,
}: Props) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [perm, setPerm] = useState(notificationPermission());
  const [weekly, setWeekly] = useState(getPrefs().weeklyReview);

  function refresh() {
    setReminders(RemindersRepository.getActive());
    onCountsChanged();
  }

  useEffect(() => {
    refresh();
    Promise.all([
      CategoryRepository.getCategories(),
      CategoryRepository.getSubcategories(),
      CategoryRepository.getAliases(),
    ]).then(([c, s, a]) => {
      setCategories(c);
      setSubcategories(s);
      setAliases(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const due = reminders.filter((r) => new Date(r.dueAt).getTime() <= Date.now());
  const upcoming = reminders.filter((r) => new Date(r.dueAt).getTime() > Date.now());

  async function addNow(r: Reminder) {
    const text = r.rawText ?? `${r.amount ?? ''} ${r.label}`.trim();
    const cmd = parseInput(text, aliases, categories, subcategories);
    if (cmd.kind !== 'expense') {
      alert('Could not rebuild this expense — add it from the Add tab instead.');
      return;
    }
    await ExpenseRepository.addExpense({
      amount: cmd.amount,
      categoryId: cmd.categoryId,
      subcategoryId: cmd.subcategoryId,
      note: cmd.note,
      rawText: r.rawText,
    });
    playSound(cmd.categoryId ? 'success' : 'uncategorized');
    RemindersRepository.setDone(r.id);
    refresh();
    onDataChanged();
  }

  function dismiss(r: Reminder) {
    RemindersRepository.setDone(r.id);
    if (r.kind === 'weekly') setPrefs({ lastWeeklyNudgeAt: new Date().toISOString() });
    refresh();
  }

  function snooze(r: Reminder, days: number) {
    RemindersRepository.snooze(r.id, days);
    if (r.kind === 'weekly') setPrefs({ lastWeeklyNudgeAt: new Date().toISOString() });
    refresh();
  }

  function reviewWeekly(r: Reminder) {
    RemindersRepository.setDone(r.id);
    setPrefs({ lastWeeklyNudgeAt: new Date().toISOString() });
    refresh();
    onOpenReels();
  }

  async function enableNotifications() {
    const ok = await requestNotificationPermission();
    setPerm(notificationPermission());
    if (ok) setPrefs({ reminderNotifications: true });
  }

  function toggleWeekly() {
    const next = !weekly;
    setWeekly(next);
    setPrefs({ weeklyReview: next });
  }

  function renderReminder(r: Reminder, overdue: boolean) {
    return (
      <div className={`reminder ${overdue ? 'reminder--due' : ''}`} key={r.id}>
        <div className="reminder__main">
          <div className="reminder__label">
            {r.kind === 'weekly' ? '🗓️ ' : '⏰ '}
            {r.label}
          </div>
          <div className="reminder__meta">
            {r.kind === 'reexpense' && r.amount ? `${formatINR(r.amount)} · ` : ''}
            {overdue ? formatDate(r.dueAt) : dueLabel(r.dueAt)}
          </div>
        </div>
        <div className="reminder__actions">
          {r.kind === 'weekly' ? (
            <button className="btn btn--sm" onClick={() => reviewWeekly(r)}>
              Review
            </button>
          ) : (
            <button className="btn btn--sm" onClick={() => addNow(r)}>
              Add now
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => snooze(r, 7)}>
            Snooze
          </button>
          <button
            className="iconbtn"
            onClick={() => dismiss(r)}
            title="Dismiss"
            aria-label="Dismiss reminder"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="inbox-overlay" onClick={onClose} />
      <div className="inbox" role="dialog" aria-label="Reminders">
        <div className="inbox__head">
          <strong>🔔 Reminders</strong>
          <button className="iconbtn" onClick={onClose} aria-label="Close reminders">
            ✕
          </button>
        </div>

        <div className="inbox__body">
          {reminders.length === 0 && (
            <div className="empty">
              No reminders yet. On the Reels tab, tap <strong>⏰ Remind</strong> on an expense to be
              nudged to add it again later.
            </div>
          )}

          {due.length > 0 && (
            <>
              <div className="inbox__section">Due</div>
              {due.map((r) => renderReminder(r, true))}
            </>
          )}

          {upcoming.length > 0 && (
            <>
              <div className="inbox__section">Upcoming</div>
              {upcoming.map((r) => renderReminder(r, false))}
            </>
          )}
        </div>

        <div className="inbox__foot">
          {perm !== 'granted' && perm !== 'unsupported' && (
            <button className="btn btn--ghost btn--sm" onClick={enableNotifications}>
              🔔 Enable notifications
            </button>
          )}
          <label className="inbox__toggle">
            <input type="checkbox" checked={weekly} onChange={toggleWeekly} />
            Weekly review nudge
          </label>
        </div>
      </div>
    </>
  );
}
