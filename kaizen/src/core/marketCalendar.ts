//
// Indian stock-market (NSE/BSE) trading-day calendar.
//
// A SIP instalment is only *allotted* on a trading day: if the SIP date falls on
// a weekend or an exchange holiday, the AMC processes it on the NEXT working day
// (Mon–Fri, non-holiday). We use this to date auto-generated SIP buys correctly
// and to pick the right NAV.
//
// Exchange holidays change yearly and there's no free API, so we hard-code the
// published NSE trading holidays we know (2024–2026) and ASSUME anything else is
// a working day unless it's a weekend. The logic degrades gracefully: an unknown
// year simply falls back to weekend-only skipping, which is close enough and
// never breaks (the caller also walks NAV back to the last published price).

/** Local-midnight `yyyy-mm-dd` key for a date (no timezone drift). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Saturday (6) or Sunday (0). */
export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Published NSE trading holidays (full-day market closures) for the years we
 * know. Kept as `yyyy-mm-dd` strings. Muhurat/partial sessions are ignored (the
 * market is effectively open). Missing years just fall back to weekend-only.
 */
export const NSE_HOLIDAYS: ReadonlySet<string> = new Set<string>([
  // 2024
  '2024-01-26', '2024-03-08', '2024-03-25', '2024-03-29', '2024-04-11',
  '2024-04-17', '2024-05-01', '2024-05-20', '2024-06-17', '2024-07-17',
  '2024-08-15', '2024-10-02', '2024-11-01', '2024-11-15', '2024-12-25',
  // 2025
  '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-10', '2025-04-14',
  '2025-04-18', '2025-05-01', '2025-08-15', '2025-08-27', '2025-10-02',
  '2025-10-21', '2025-10-22', '2025-11-05', '2025-12-25',
  // 2026 (published/estimated — safe to over-skip; caller reuses last NAV)
  '2026-01-26', '2026-02-15', '2026-03-04', '2026-03-21', '2026-04-01',
  '2026-04-03', '2026-04-14', '2026-05-01', '2026-08-15', '2026-09-14',
  '2026-10-02', '2026-10-20', '2026-11-10', '2026-12-25',
]);

/** True if `d` is a full-day exchange holiday (per {@link NSE_HOLIDAYS}). */
export function isMarketHoliday(d: Date): boolean {
  return NSE_HOLIDAYS.has(ymd(d));
}

/** True if the market is closed that day (weekend or exchange holiday). */
export function isMarketClosed(d: Date): boolean {
  return isWeekend(d) || isMarketHoliday(d);
}

/**
 * The trading day a purchase dated `d` actually settles on: `d` itself if the
 * market is open, otherwise the next Mon–Fri that isn't a holiday. Never loops
 * forever (guarded), and returns a fresh local-midnight Date.
 */
export function nextWorkingDay(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let guard = 0;
  while (isMarketClosed(out) && guard < 20) {
    out.setDate(out.getDate() + 1);
    guard++;
  }
  return out;
}
