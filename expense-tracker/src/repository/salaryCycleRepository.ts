import { storage } from '../storage';
import { newId, now } from '../core/util';
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
   * Closes the currently-open cycle (if any) and opens a new one starting at
   * `startDate` (default now). Income is optional — this app primarily tracks
   * expenses, so a cycle is just a time period.
   */
  async startCycle(
    startDate?: string,
    opts?: { amount?: number; note?: string },
  ): Promise<SalaryCycle> {
    const ts = startDate ?? now();

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

  /** Convenience: start a cycle now and record an income amount. */
  receiveSalary(amount: number, note?: string): Promise<SalaryCycle> {
    return this.startCycle(now(), { amount, note });
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
};
