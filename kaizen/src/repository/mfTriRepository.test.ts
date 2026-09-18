import { describe, expect, it } from 'vitest';
import { parseTriRows } from './mfTriRepository';

describe('parseTriRows', () => {
  it('parses official TRI rows, rejects invalid values, and sorts newest first', () => {
    const points = parseTriRows([
      { date: '2025-01-02', value: 34000.25 },
      { date: '2025-01-03', value: 34100.5 },
      { date: 'bad', value: 0 },
    ]);
    expect(points).toHaveLength(2);
    expect(points[0].nav).toBe(34100.5);
    expect(points[1].nav).toBe(34000.25);
  });
});