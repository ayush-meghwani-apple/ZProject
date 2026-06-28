/** Small user preferences stored in localStorage (outside the expense DB). */

const KEY = 'expense:prefs';

export interface Prefs {
  /** Amount at/above which a Reel is shown as a "big spend". 0 disables it. */
  bigExpenseThreshold: number;
}

const DEFAULTS: Prefs = {
  bigExpenseThreshold: 0,
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
