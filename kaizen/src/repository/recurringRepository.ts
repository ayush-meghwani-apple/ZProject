import { storage } from '../storage';
import { newId, now } from '../core/util';
import { ExpenseRepository } from './expenseRepository';
import type { ID, RecurringExpense, RecurringFrequency } from '../types/models';

/** Local-midnight Date for the given date (strips the time component). */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Advance a date to the next occurrence for the given frequency. */
function advance(dateIso: string, freq: RecurringFrequency, dayOfMonth?: number): string {
  const d = startOfDay(new Date(dateIso));
  if (freq === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (freq === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else {
    // monthly: jump to the same day next month, clamped to that month's length.
    const day = dayOfMonth ?? d.getDate();
    const target = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const clamped = Math.min(day, lastDayOfMonth(target.getFullYear(), target.getMonth()));
    target.setDate(clamped);
    return startOfDay(target).toISOString();
  }
  return startOfDay(d).toISOString();
}

export type NewRecurringInput = {
  amount: number;
  categoryId?: ID;
  subcategoryId?: ID;
  note?: string;
  frequency: RecurringFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
};

/** First date at/after today that satisfies the schedule. */
function firstNextDate(input: NewRecurringInput): string {
  const today = startOfDay(new Date());
  if (input.frequency === 'daily') {
    return today.toISOString();
  }
  if (input.frequency === 'weekly') {
    const target = input.dayOfWeek ?? today.getDay();
    const diff = (target - today.getDay() + 7) % 7;
    const next = new Date(today);
    next.setDate(today.getDate() + diff);
    return startOfDay(next).toISOString();
  }
  // monthly
  const dom = input.dayOfMonth ?? today.getDate();
  const thisMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    Math.min(dom, lastDayOfMonth(today.getFullYear(), today.getMonth())),
  );
  if (startOfDay(thisMonth).getTime() >= today.getTime()) {
    return startOfDay(thisMonth).toISOString();
  }
  const nm = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  nm.setDate(Math.min(dom, lastDayOfMonth(nm.getFullYear(), nm.getMonth())));
  return startOfDay(nm).toISOString();
}

export const RecurringRepository = {
  getAll(): Promise<RecurringExpense[]> {
    return storage.recurring.getAll();
  },

  async add(input: NewRecurringInput): Promise<RecurringExpense> {
    const ts = now();
    const rec: RecurringExpense = {
      id: newId(),
      amount: input.amount,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      note: input.note,
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      nextDate: firstNextDate(input),
      active: true,
      createdAt: ts,
      updatedAt: ts,
    };
    await storage.recurring.put(rec);
    return rec;
  },

  async update(rec: RecurringExpense): Promise<void> {
    rec.updatedAt = now();
    await storage.recurring.put(rec);
  },

  async remove(id: ID): Promise<void> {
    await storage.recurring.delete(id);
  },

  async toggle(id: ID): Promise<void> {
    const rec = await storage.recurring.get(id);
    if (!rec) return;
    rec.active = !rec.active;
    rec.updatedAt = now();
    await storage.recurring.put(rec);
  },

  /**
   * Generates any expenses that are due (nextDate on/before today) for every
   * active template, advancing each schedule. Safe to call on every app start;
   * returns the number of expenses created.
   */
  async runDue(): Promise<number> {
    const all = await storage.recurring.getAll();
    const todayEnd = startOfDay(new Date()).getTime() + 86400000 - 1;
    let created = 0;

    for (const rec of all) {
      if (!rec.active) continue;
      let guard = 0;
      let changed = false;
      while (new Date(rec.nextDate).getTime() <= todayEnd && guard < 120) {
        await ExpenseRepository.addExpense({
          amount: rec.amount,
          categoryId: rec.categoryId,
          subcategoryId: rec.subcategoryId,
          note: rec.note,
          rawText: '↻ recurring',
          date: rec.nextDate,
          recurringId: rec.id,
        });
        rec.nextDate = advance(rec.nextDate, rec.frequency, rec.dayOfMonth);
        created++;
        guard++;
        changed = true;
      }
      if (changed) {
        rec.updatedAt = now();
        await storage.recurring.put(rec);
      }
    }
    return created;
  },
};
