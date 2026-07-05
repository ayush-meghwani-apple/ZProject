/** Small user preferences stored in localStorage (outside the expense DB). */

const KEY = 'expense:prefs';

export interface Prefs {
  /** Amount at/above which a Reel is shown as a "big spend". 0 disables it. */
  bigExpenseThreshold: number;
  /** Play short sound cues when adding expenses/notes. */
  soundEnabled: boolean;
  /** Fire best-effort local notifications for due reminders. */
  reminderNotifications: boolean;
  /** Show a weekly "review last week" nudge in the reminders inbox. */
  weeklyReview: boolean;
  /** When the last weekly-review nudge was created (ISO). */
  lastWeeklyNudgeAt?: string;
  /** How often (in days) to auto-prompt for a data backup on app open. */
  backupReminderDays: number;
}

const DEFAULTS: Prefs = {
  bigExpenseThreshold: 0,
  soundEnabled: true,
  reminderNotifications: false,
  weeklyReview: true,
  backupReminderDays: 1,
};

export function getPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* ignore unavailable/corrupt storage */
  }
  return { ...DEFAULTS };
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
