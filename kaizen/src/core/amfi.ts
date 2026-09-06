//
// AMFI mutual-fund NAV client.
//
// Google Sheets / Excel pull Indian MF NAVs from AMFI (the official body that
// publishes every scheme's NAV daily). We use the free, CORS-enabled JSON
// wrapper at api.mfapi.in — no API key, no rate limit — the same source, in a
// shape a browser can consume directly.
//
//   • search:  https://api.mfapi.in/mf/search?q=<query>  -> [{schemeCode, schemeName}]
//   • history: https://api.mfapi.in/mf/<schemeCode>       -> { data: [{date:"dd-mm-yyyy", nav}] }
//
// All functions are best-effort: on a network/CORS failure they throw, and the
// UI falls back to the last NAV cached on the fund (so an offline app still
// shows a value).

const BASE = 'https://api.mfapi.in/mf';

export interface SchemeMatch {
  schemeCode: number;
  schemeName: string;
}

/** One day's NAV, parsed. `date` is local-midnight; `iso` is its ISO string. */
export interface NavPoint {
  date: Date;
  iso: string;
  nav: number;
}

export interface SchemeMeta {
  fundHouse?: string;
  schemeType?: string;
  schemeCategory?: string;
  schemeCode: number;
  schemeName: string;
}

export interface NavHistory {
  meta: SchemeMeta;
  points: NavPoint[];
}

/** Parse AMFI's "dd-mm-yyyy" into a local-midnight Date. */
function parseNavDate(s: string): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

/** Search AMFI schemes by name (fund house / scheme keywords). */
export async function searchSchemes(query: string): Promise<SchemeMatch[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`Scheme search failed (${res.status})`);
  const raw = (await res.json()) as { schemeCode: number; schemeName: string }[];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => Number.isFinite(Number(r.schemeCode)) && typeof r.schemeName === 'string')
    .map((r) => ({ schemeCode: Number(r.schemeCode), schemeName: r.schemeName }));
}

// Session cache of NAV histories (schemeCode -> points, newest first), so a
// single app session doesn't re-download the same fund's history repeatedly.
const historyCache = new Map<number, { at: number; history: NavHistory }>();
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000; // 6h — NAV updates at most once a day

/** Fetch a scheme's full NAV history, newest first. Cached for the session. */
export async function fetchNavHistory(schemeCode: number, force = false): Promise<NavPoint[]> {
  return (await fetchNavHistoryWithMeta(schemeCode, force)).points;
}

/** Fetch NAV history together with the official scheme metadata supplied by
 *  MFAPI. Existing callers that need only prices use fetchNavHistory(). */
export async function fetchNavHistoryWithMeta(schemeCode: number, force = false): Promise<NavHistory> {
  const cached = historyCache.get(schemeCode);
  if (!force && cached && Date.now() - cached.at < HISTORY_TTL_MS) return cached.history;

  const res = await fetch(`${BASE}/${schemeCode}`);
  if (!res.ok) throw new Error(`NAV fetch failed (${res.status})`);
  const json = (await res.json()) as {
    meta?: {
      fund_house?: string;
      scheme_type?: string;
      scheme_category?: string;
      scheme_code?: number;
      scheme_name?: string;
    };
    data?: { date: string; nav: string }[];
  };
  const points: NavPoint[] = [];
  for (const row of json.data ?? []) {
    const date = parseNavDate(row.date);
    const nav = Number(row.nav);
    if (date && Number.isFinite(nav) && nav > 0) points.push({ date, iso: date.toISOString(), nav });
  }
  // AMFI returns newest-first already, but sort defensively (desc by date).
  points.sort((a, b) => b.date.getTime() - a.date.getTime());
  const history: NavHistory = {
    meta: {
      fundHouse: json.meta?.fund_house,
      schemeType: json.meta?.scheme_type,
      schemeCategory: json.meta?.scheme_category,
      schemeCode: Number(json.meta?.scheme_code) || schemeCode,
      schemeName: json.meta?.scheme_name ?? '',
    },
    points,
  };
  historyCache.set(schemeCode, { at: Date.now(), history });
  return history;
}

export async function fetchNavHistoryRange(schemeCode: number, start: Date, end: Date): Promise<NavHistory> {
  const isoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const params = new URLSearchParams({ startDate: isoDate(start), endDate: isoDate(end) });
  const res = await fetch(`${BASE}/${schemeCode}?${params}`);
  if (!res.ok) throw new Error(`NAV fetch failed (${res.status})`);
  const json = (await res.json()) as {
    meta?: {
      fund_house?: string;
      scheme_type?: string;
      scheme_category?: string;
      scheme_code?: number;
      scheme_name?: string;
    };
    data?: { date: string; nav: string }[];
  };
  const points = (json.data ?? [])
    .map((row) => {
      const date = parseNavDate(row.date);
      const nav = Number(row.nav);
      return date && Number.isFinite(nav) && nav > 0 ? { date, iso: date.toISOString(), nav } : null;
    })
    .filter((point): point is NavPoint => point != null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  return {
    meta: {
      fundHouse: json.meta?.fund_house,
      schemeType: json.meta?.scheme_type,
      schemeCategory: json.meta?.scheme_category,
      schemeCode: Number(json.meta?.scheme_code) || schemeCode,
      schemeName: json.meta?.scheme_name ?? '',
    },
    points,
  };
}

/** The most recent NAV point (or null if history is empty). */
export function latestNav(points: NavPoint[]): NavPoint | null {
  return points.length > 0 ? points[0] : null;
}

/** The NAV effective on-or-before a target date — i.e. the price a purchase on
 *  that date would have been allotted at (markets are shut on weekends/holidays,
 *  so we walk back to the last published NAV). Returns null if none is early
 *  enough (target predates the fund's history). */
export function navOnOrBefore(points: NavPoint[], target: Date): NavPoint | null {
  const t = target.getTime();
  // points are newest-first; the first one at/or-before target is the answer.
  for (const p of points) {
    if (p.date.getTime() <= t) return p;
  }
  return null;
}
