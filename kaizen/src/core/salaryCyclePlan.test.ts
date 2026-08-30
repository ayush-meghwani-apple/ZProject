import { describe, it, expect } from 'vitest';
import { planSalaryCycle } from './salaryCyclePlan';
import type { SalaryCycle } from '../types/models';

const iso = (d: string) => `${d}T00:00:00.000Z`;
let counter = 0;
const mkId = () => `new-${++counter}`;

function opts(amount = 200000, prevStart = iso('2025-07-28')) {
  counter = 0;
  return { amount, prevStart, mkId, note: 'IDFC · Salary' };
}

describe('planSalaryCycle', () => {
  it("YOUR SCENARIO: manual cycle Aug 26 + salary Aug 28 → old cycle closes at Aug 28, new cycle from Aug 28", () => {
    const cycles: SalaryCycle[] = [{ id: 'A', startDate: iso('2025-08-26'), salaryReceived: 0 }];
    const { puts, resultId } = planSalaryCycle(cycles, iso('2025-08-28'), opts());

    const oldCycle = puts.find((c) => c.id === 'A')!;
    const salaryCycle = puts.find((c) => c.id === resultId)!;
    // Old (manual) cycle now ends at the salary date → becomes the previous cycle.
    expect(oldCycle.endDate).toBe(iso('2025-08-28'));
    expect(oldCycle.startDate).toBe(iso('2025-08-26')); // start unchanged
    // New current cycle starts on the salary date and is open + flagged.
    expect(salaryCycle.startDate).toBe(iso('2025-08-28'));
    expect(salaryCycle.endDate).toBeUndefined();
    expect(salaryCycle.autoSalary).toBe(true);
    // An Aug-27 expense (>= Aug 26, < Aug 28) therefore lands in the previous
    // cycle — never September.
    expect(iso('2025-08-27') >= oldCycle.startDate && iso('2025-08-27') < oldCycle.endDate!).toBe(
      true,
    );
    // No synthesised previous cycle needed (the manual one covers it).
    expect(puts.length).toBe(2);
  });

  it('same-day cycle → annotates it, creates nothing new', () => {
    const cycles: SalaryCycle[] = [{ id: 'A', startDate: iso('2025-08-28'), salaryReceived: 0 }];
    const { puts, resultId } = planSalaryCycle(cycles, iso('2025-08-28'), opts());
    expect(resultId).toBe('A');
    expect(puts).toHaveLength(1);
    expect(puts[0].autoSalary).toBe(true);
    expect(puts[0].salaryReceived).toBe(200000);
  });

  it('precedence: an open cycle starting AFTER the salary snaps back to it', () => {
    const cycles: SalaryCycle[] = [
      { id: 'P', startDate: iso('2025-07-28'), endDate: iso('2025-08-28'), salaryReceived: 0 },
      { id: 'A', startDate: iso('2025-08-28'), salaryReceived: 0 }, // payday guess
    ];
    // Salary actually landed Aug 27 (28th was a holiday).
    const { puts, resultId } = planSalaryCycle(cycles, iso('2025-08-27'), opts());
    expect(resultId).toBe('A');
    const snapped = puts.find((c) => c.id === 'A')!;
    const prev = puts.find((c) => c.id === 'P')!;
    expect(snapped.startDate).toBe(iso('2025-08-27'));
    expect(snapped.autoSalary).toBe(true);
    expect(prev.endDate).toBe(iso('2025-08-27')); // previous cycle end moves with it
  });

  it('fresh app (no cycles) → makes a previous cycle + the salary cycle', () => {
    const { puts, resultId } = planSalaryCycle([], iso('2025-08-28'), opts());
    expect(puts).toHaveLength(2);
    const prev = puts.find((c) => c.id !== resultId)!;
    const salary = puts.find((c) => c.id === resultId)!;
    expect(prev.startDate).toBe(iso('2025-07-28'));
    expect(prev.endDate).toBe(iso('2025-08-28'));
    expect(salary.startDate).toBe(iso('2025-08-28'));
    expect(salary.endDate).toBeUndefined();
  });

  it('leaves older closed cycles untouched (not in the upsert set)', () => {
    const cycles: SalaryCycle[] = [
      { id: 'OLD', startDate: iso('2025-06-28'), endDate: iso('2025-07-28'), salaryReceived: 0 },
      { id: 'MID', startDate: iso('2025-07-28'), endDate: iso('2025-08-26'), salaryReceived: 0 },
      { id: 'A', startDate: iso('2025-08-26'), salaryReceived: 0 },
    ];
    const { puts } = planSalaryCycle(cycles, iso('2025-08-28'), opts());
    // Only the open cycle (closed at salary) + the new salary cycle are written.
    expect(puts.some((c) => c.id === 'OLD')).toBe(false);
    expect(puts.some((c) => c.id === 'MID')).toBe(false);
    expect(puts.some((c) => c.id === 'A')).toBe(true);
  });
});
