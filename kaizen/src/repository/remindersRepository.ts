import { newId, now } from '../core/util';
import { getPrefs, setPrefs } from '../core/preferences';

/**
 * A reminder to do something later — mostly "add this expense again" (e.g. a
 * car-insurance premium 11 months from now), plus the auto weekly "review last
 * week" nudge. Kept in localStorage (like notes) since it isn't money itself,
 * and surfaced through the 🔔 bell inbox in the header.
 */
export type ReminderKind = 'reexpense' | 'weekly';

export interface Reminder {
  id: string;
  kind: ReminderKind;
  label: string; // human text shown in the inbox
  rawText?: string; // reexpense: chat text to re-parse when adding (e.g. "5000 Car Insurance")
  amount?: number; // reexpense: suggested amount
  dueAt: string; // ISO — when it becomes due
  createdAt: string;
  done: boolean;
  notified?: boolean; // a local notification has already fired for it
  sourceExpenseId?: string;
}

const KEY = 'expense:reminders';
const DAY = 86_400_000;

function read(): Reminder[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Reminder[]) : [];
  } catch {
    return [];
  }
}

function write(list: Reminder[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 300)));
  } catch {
    /* ignore unavailable storage */
  }
}

export type NewReminder = Omit<Reminder, 'id' | 'createdAt' | 'done' | 'notified'>;

export const RemindersRepository = {
  getAll(): Reminder[] {
    return read().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  },

  getActive(): Reminder[] {
    return this.getAll().filter((r) => !r.done);
  },

  /** Active reminders whose due date has arrived. */
  getDue(at: number = Date.now()): Reminder[] {
    return this.getActive().filter((r) => new Date(r.dueAt).getTime() <= at);
  },

  /** Active reminders still in the future. */
  getUpcoming(at: number = Date.now()): Reminder[] {
    return this.getActive().filter((r) => new Date(r.dueAt).getTime() > at);
  },

  dueCount(): number {
    return this.getDue().length;
  },

  add(input: NewReminder): Reminder {
    const reminder: Reminder = {
      ...input,
      id: newId(),
      createdAt: now(),
      done: false,
    };
    write([reminder, ...read()]);
    return reminder;
  },

  setDone(id: string, done = true): void {
    write(read().map((r) => (r.id === id ? { ...r, done } : r)));
  },

  remove(id: string): void {
    write(read().filter((r) => r.id !== id));
  },

  /** Push a reminder's due date out by `days`. */
  snooze(id: string, days: number): void {
    write(
      read().map((r) =>
        r.id === id
          ? { ...r, dueAt: new Date(Date.now() + days * DAY).toISOString(), notified: false }
          : r,
      ),
    );
  },

  markNotified(id: string): void {
    write(read().map((r) => (r.id === id ? { ...r, notified: true } : r)));
  },

  /** Dismiss every active reminder at once (clears the bell). */
  clearAll(): void {
    write(read().map((r) => (r.done ? r : { ...r, done: true })));
  },

  /**
   * Create a weekly "review last week" nudge if enabled and one isn't already
   * pending, at most once every `intervalDays`. Called on app open, so nudges
   * appear naturally as you use the app (no background scheduling needed).
   */
  ensureWeeklyNudge(intervalDays = 7): void {
    const prefs = getPrefs();
    if (!prefs.weeklyReview) return;
    if (this.getActive().some((r) => r.kind === 'weekly')) return;
    const last = prefs.lastWeeklyNudgeAt ? new Date(prefs.lastWeeklyNudgeAt).getTime() : 0;
    if (last && Date.now() - last < intervalDays * DAY) return;
    this.add({
      kind: 'weekly',
      label: "Review last week's expenses — add anything you forgot.",
      dueAt: now(),
    });
    setPrefs({ lastWeeklyNudgeAt: now() });
  },
};
