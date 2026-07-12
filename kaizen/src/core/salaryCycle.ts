import { formatDate } from './util';
import type { SalaryCycle } from '../types/models';

/** Human-readable label for a cycle, e.g. "27 May 2026 – present". */
export function cycleLabel(cycle: SalaryCycle): string {
  const start = formatDate(cycle.startDate);
  const end = cycle.endDate ? formatDate(cycle.endDate) : 'present';
  return `${start} – ${end}`;
}

export function isOpen(cycle: SalaryCycle): boolean {
  return !cycle.endDate;
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

/**
 * Names a cycle after the calendar month that contributes the most days to it.
 * Open cycles are projected to last one month from their start.
 * e.g. start 24 Jun -> "Jul-26" (July owns more of the 24 Jun–24 Jul span).
 */
export function cycleName(cycle: SalaryCycle): string {
  const start = new Date(cycle.startDate);
  const end = cycle.endDate ? new Date(cycle.endDate) : addMonths(start, 1);

  const counts = new Map<string, number>();
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur < last) {
    const key = `${cur.getFullYear()}-${cur.getMonth()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    cur.setDate(cur.getDate() + 1);
  }
  if (counts.size === 0) {
    counts.set(`${start.getFullYear()}-${start.getMonth()}`, 1);
  }

  let bestKey = '';
  let bestCount = -1;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      bestKey = k;
    }
  }
  const [y, m] = bestKey.split('-').map(Number);
  const month = new Date(y, m).toLocaleDateString('en-IN', { month: 'short' });
  return `${month}-${String(y).slice(2)}`;
}
