import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTriBenchmark, parseTriRows } from './mfTriRepository';

afterEach(() => vi.unstubAllGlobals());

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

  it('loads the selected official TRI snapshot and preserves its audit metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        indexName: 'Nifty Midcap 150 TRI',
        source: 'NSE Indices Limited',
        sourceUrl: 'https://www.niftyindices.com/reports/historical-data',
        retrievedAt: '2026-09-27T00:00:00.000Z',
        requestNumbers: ['123'],
        rows: [
          { date: '2026-09-01', value: 200 },
          { date: '2026-09-02', value: 202 },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const benchmark = await fetchTriBenchmark('nifty-midcap-150', [
      Date.UTC(2026, 8, 1),
      Date.UTC(2026, 8, 2),
    ]);

    expect(fetchMock).toHaveBeenCalledWith('/benchmarks/nifty-midcap-150-tri.json');
    expect(benchmark).toMatchObject({
      benchmarkId: 'nifty-midcap-150',
      indexName: 'Nifty Midcap 150 TRI',
      source: 'NSE Indices Limited',
      values: [100, 101],
    });
    expect(benchmark.points.map((point) => point.nav)).toEqual([202, 200]);
  });

  it('rejects a snapshot whose index identity does not match the requested benchmark', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ indexName: 'Nifty 500 TRI', source: 'NSE Indices Limited', rows: [] }),
    }));

    await expect(fetchTriBenchmark('nifty-50', [1, 2])).rejects.toThrow('Nifty 50 TRI snapshot is invalid');
  });
});