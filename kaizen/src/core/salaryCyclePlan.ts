// Pure salary-cycle boundary planning. Given the existing cycles and a detected
// salary credit date, it returns the cycles to upsert so the SALARY DATE is the
// authoritative start of the current cycle — without touching older cycles.
//
// Rules (the salary date always wins over prior manual/auto cycle logic):
//  - A cycle already starting that day → just flag it as the salary cycle.
//  - An open cycle starting AFTER the salary date (a payday guess or a date set
//    later than payday) snaps back to the salary date; its previous cycle's end
//    moves with it. (precedence)
//  - An open cycle starting BEFORE the salary date is closed at the salary date
//    → it becomes the "previous" cycle; the salary opens a new current cycle.
//  - If nothing starts before the salary date, a previous cycle is created so
//    pre-salary expenses have a home (two cycles from one sync).
// Older, already-closed cycles are never included in the result.

import type { SalaryCycle } from '../types/models';

export interface SalaryCyclePlanOptions {
  amount: number;
  note?: string;
  /** Start date for a synthesised previous cycle (payday before the salary). */
  prevStart: string;
  /** Id factory (pass the app's newId; injected so this stays pure/testable). */
  mkId: () => string;
}

export interface SalaryCyclePlan {
  /** Cycles to create or update (upsert). Nothing else is modified. */
  puts: SalaryCycle[];
  /** The id of the resulting salary cycle. */
  resultId: string;
}

export function planSalaryCycle(
  cycles: SalaryCycle[],
  salaryDateISO: string,
  opts: SalaryCyclePlanOptions,
): SalaryCyclePlan {
  const { amount, note, prevStart, mkId } = opts;
  const day = salaryDateISO.slice(0, 10);
  const puts: SalaryCycle[] = [];

  // Exact same-day cycle → annotate it, create nothing.
  const sameDay = cycles.find((c) => c.startDate.slice(0, 10) === day);
  if (sameDay) {
    puts.push({
      ...sameDay,
      autoSalary: true,
      salaryReceived: amount > 0 ? amount : sameDay.salaryReceived,
      note: note ?? sameDay.note,
    });
    return { puts, resultId: sameDay.id };
  }

  const open = cycles.find((c) => !c.endDate);

  // Precedence: an open cycle starting after the salary date snaps back to it.
  if (open && open.startDate > salaryDateISO) {
    const prevOfOpen = cycles.find((c) => c.id !== open.id && c.endDate === open.startDate);
    if (prevOfOpen) puts.push({ ...prevOfOpen, endDate: salaryDateISO });
    puts.push({
      ...open,
      startDate: salaryDateISO,
      autoSalary: true,
      salaryReceived: amount > 0 ? amount : open.salaryReceived,
      note: note ?? open.note,
    });
    return { puts, resultId: open.id };
  }

  // Open cycle starts before the salary → it becomes the previous cycle.
  if (open && open.startDate < salaryDateISO) {
    puts.push({ ...open, endDate: salaryDateISO });
  }

  // Ensure a previous cycle exists to hold pre-salary expenses.
  const anyBefore = cycles.some((c) => c.startDate < salaryDateISO);
  if (!anyBefore) {
    puts.push({ id: mkId(), startDate: prevStart, endDate: salaryDateISO, salaryReceived: 0 });
  }

  const resultId = mkId();
  puts.push({
    id: resultId,
    startDate: salaryDateISO,
    salaryReceived: amount ?? 0,
    note,
    autoSalary: true,
  });
  return { puts, resultId };
}
