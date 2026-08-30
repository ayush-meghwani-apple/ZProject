import { storage } from '../storage';
import { newId } from '../core/util';
import { currentCycleStart } from '../core/cycleDate';
import { planSalaryCycle } from '../core/salaryCyclePlan';
import { getPrefs, setPrefs } from '../core/preferences';
import { ActivityRepository } from './activityRepository';
import type { SalaryCycle } from '../types/models';

export const SalaryCycleRepository = {
  getCycles(): Promise<SalaryCycle[]> {
    return storage.salaryCycles.getAll();
  },

  /** The currently-open cycle (no endDate), if any. */
  async getOpenCycle(): Promise<SalaryCycle | undefined> {
    const all = await storage.salaryCycles.getAll();
    return all.find((c) => !c.endDate);
  },

  async getCyclesSorted(): Promise<SalaryCycle[]> {
    const all = await storage.salaryCycles.getAll();
    return all.sort((a, b) => b.startDate.localeCompare(a.startDate));
  },

  /**
   * Closes the currently-open cycle (if any) and opens a new one. When no start
   * date is given it defaults to the current salary period's start — the 28th of
   * the month, or the preceding Friday if that's a weekend — so cycles line up
   * with payday automatically. Income is optional; a cycle is just a period.
   */
  async startCycle(
    startDate?: string,
    opts?: { amount?: number; note?: string },
  ): Promise<SalaryCycle> {
    // No explicit date → use the user's edited "next cycle" date if they set
    // one (then clear it), otherwise the computed payday for this period.
    let ts = startDate;
    if (!ts) {
      const override = getPrefs().nextCycleStartOverride;
      if (override) {
        ts = override;
        setPrefs({ nextCycleStartOverride: undefined });
      } else {
        ts = currentCycleStart(new Date()).toISOString();
      }
    }

    const previous = await this.getOpenCycle();
    if (previous) {
      previous.endDate = ts;
      await storage.salaryCycles.put(previous);
      await ActivityRepository.log('salaryCycle.closed', 'salaryCycle', previous.id);
    }

    const cycle: SalaryCycle = {
      id: newId(),
      startDate: ts,
      salaryReceived: opts?.amount ?? 0,
      note: opts?.note,
    };
    await storage.salaryCycles.put(cycle);
    await ActivityRepository.log('salaryCycle.opened', 'salaryCycle', cycle.id, {
      amount: opts?.amount ?? 0,
    });
    return cycle;
  },

  /** Convenience: start a cycle (defaults to payday) and record an income amount. */
  receiveSalary(amount: number, note?: string): Promise<SalaryCycle> {
    return this.startCycle(undefined, { amount, note });
  },

  /**
   * Start (or annotate) a salary cycle from an auto-detected salary credit. If a
   * cycle already begins on that day it is flagged and its income updated;
   * otherwise a new cycle opens at the credit date. Expenses are re-bucketed by
   * date afterwards. Marks the cycle `autoSalary` so the UI can celebrate it.
   */
  async receiveSalaryFromEmail(
    dateISO: string,
    amount: number,
    note?: string,
  ): Promise<SalaryCycle> {
    const all = await storage.salaryCycles.getAll();
    const prevStart = currentCycleStart(
      new Date(new Date(dateISO).getTime() - 86_400_000),
    ).toISOString();
    const { puts, resultId } = planSalaryCycle(all, dateISO, { amount, note, prevStart, mkId: newId });
    for (const c of puts) await storage.salaryCycles.put(c);
    await ActivityRepository.log('salaryCycle.opened', 'salaryCycle', resultId, { autoSalary: true });
    await this.reassignExpensesByDate();
    return (await storage.salaryCycles.get(resultId)) as SalaryCycle;
  },

  /** Remove cycles started from detected salary credits (testing/reset). Reopens
   *  the latest remaining cycle and re-buckets expenses. Returns how many went. */
  async clearAutoSalaryCycles(): Promise<number> {
    const all = await storage.salaryCycles.getAll();
    const auto = all.filter((c) => c.autoSalary);
    for (const c of auto) await storage.salaryCycles.delete(c.id);
    if (auto.length) {
      const remaining = (await storage.salaryCycles.getAll()).sort((a, b) =>
        b.startDate.localeCompare(a.startDate),
      );
      if (remaining[0]?.endDate) {
        remaining[0].endDate = undefined;
        await storage.salaryCycles.put(remaining[0]);
      }
      await this.reassignExpensesByDate();
    }
    return auto.length;
  },

  /**
   * Manually set the start date of the open cycle (Settings screen). If no
   * cycle is open yet, one is created starting at that date. Keeps the
   * previous cycle contiguous by moving its end date to match.
   */
  async setOpenCycleStartDate(dateISO: string): Promise<SalaryCycle> {
    const open = await this.getOpenCycle();
    if (!open) {
      return this.startCycle(dateISO);
    }

    const oldStart = open.startDate;
    open.startDate = dateISO;
    await storage.salaryCycles.put(open);

    const all = await storage.salaryCycles.getAll();
    const prev = all.find((c) => c.endDate === oldStart);
    if (prev) {
      prev.endDate = dateISO;
      await storage.salaryCycles.put(prev);
    }

    await ActivityRepository.log('salaryCycle.opened', 'salaryCycle', open.id, {
      startDateChanged: true,
    });
    return open;
  },

  /**
   * Assign every expense to the cycle whose date-range contains it, based on the
   * expense's own date. This makes cycle membership derive from the date rather
   * than from whatever cycle happened to be open when the expense was typed —
   * so expenses added before a cycle existed (or imported from a backup, which
   * doesn't carry the tag) still show up under the correct cycle. Returns the
   * number of expenses whose tag changed. Writes straight to storage (no
   * activity-log spam).
   */
  async reassignExpensesByDate(): Promise<number> {
    const [cycles, expenses] = await Promise.all([
      storage.salaryCycles.getAll(),
      storage.expenses.getAll(),
    ]);
    if (cycles.length === 0) return 0;
    // Oldest first so a date lands in the *earliest* cycle it fits.
    const sorted = [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
    let changed = 0;
    for (const e of expenses) {
      const match =
        sorted.find((c) => e.date >= c.startDate && (!c.endDate || e.date < c.endDate)) ??
        // Before the first cycle → earliest; after everything → latest.
        (e.date < sorted[0].startDate ? sorted[0] : sorted[sorted.length - 1]);
      if (match && e.salaryCycleId !== match.id) {
        e.salaryCycleId = match.id;
        await storage.expenses.put(e);
        changed++;
      }
    }
    return changed;
  },
};
