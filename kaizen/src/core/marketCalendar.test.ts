import { describe, it, expect } from 'vitest';
import { isWeekend, isMarketHoliday, isMarketClosed, nextWorkingDay, ymd } from './marketCalendar';

describe('marketCalendar', () => {
  it('detects weekends', () => {
    expect(isWeekend(new Date(2025, 0, 4))).toBe(true); // Sat 4 Jan 2025
    expect(isWeekend(new Date(2025, 0, 5))).toBe(true); // Sun 5 Jan 2025
    expect(isWeekend(new Date(2025, 0, 6))).toBe(false); // Mon
  });

  it('detects known NSE holidays', () => {
    expect(isMarketHoliday(new Date(2025, 7, 15))).toBe(true); // 15 Aug 2025
    expect(isMarketHoliday(new Date(2025, 7, 14))).toBe(false);
  });

  it('rolls a weekend SIP date forward to the next working day', () => {
    // 4 Jan 2025 is a Saturday -> next working day is Mon 6 Jan.
    expect(ymd(nextWorkingDay(new Date(2025, 0, 4)))).toBe('2025-01-06');
  });

  it('rolls forward past a holiday that follows a weekend', () => {
    // 15 Aug 2025 (Fri) is a holiday; 16/17 are weekend -> Mon 18 Aug.
    expect(ymd(nextWorkingDay(new Date(2025, 7, 15)))).toBe('2025-08-18');
  });

  it('leaves an open trading day unchanged', () => {
    expect(ymd(nextWorkingDay(new Date(2025, 0, 6)))).toBe('2025-01-06');
    expect(isMarketClosed(new Date(2025, 0, 6))).toBe(false);
  });

  it('never loops forever on unknown future years (weekend-only fallback)', () => {
    const d = new Date(2030, 5, 15); // a Saturday
    const nwd = nextWorkingDay(d);
    expect(isWeekend(nwd)).toBe(false);
  });
});
