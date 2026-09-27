import { normalizedNavSeries } from '../core/mfBenchmark';
import { MF_BENCHMARKS, type MfBenchmarkId } from '../core/mfCategoryBenchmark';
import type { NavPoint } from '../core/amfi';

export interface TriBenchmark {
  benchmarkId: MfBenchmarkId;
  indexName: string;
  values: (number | null)[];
  source: 'NSE Indices Limited';
  periodStart: string;
  periodEnd: string;
  retrievedAt: string;
  comparisonType: 'official-tri';
}

interface TriRow {
  date: string;
  value: number;
}

interface TriSnapshot {
  indexName: string;
  source: 'NSE Indices Limited';
  sourceUrl: string;
  retrievedAt: string;
  requestNumbers: string[];
  rows: TriRow[];
}

export function parseTriRows(rows: TriRow[]): NavPoint[] {
  return rows.map((row) => {
    const date = new Date(`${row.date}T00:00:00Z`);
    const nav = Number(row.value);
    return Number.isFinite(date.getTime()) && nav > 0
      ? { date, iso: date.toISOString(), nav }
      : null;
  }).filter((point): point is NavPoint => point != null)
    .sort((left, right) => right.date.getTime() - left.date.getTime());
}

export async function fetchTriBenchmark(
  benchmarkId: MfBenchmarkId,
  timestamps: number[],
): Promise<TriBenchmark> {
  const definition = MF_BENCHMARKS[benchmarkId];
  if (timestamps.length < 2) throw new Error(`${definition.indexName} needs a valid date range.`);
  const response = await fetch(`${import.meta.env.BASE_URL}benchmarks/${definition.fileName}`);
  if (!response.ok) throw new Error(`${definition.indexName} snapshot failed (${response.status})`);
  const snapshot = await response.json() as TriSnapshot;
  if (
    snapshot.indexName !== definition.indexName ||
    snapshot.source !== 'NSE Indices Limited' ||
    !Array.isArray(snapshot.rows)
  ) {
    throw new Error(`${definition.indexName} snapshot is invalid.`);
  }
  const values = normalizedNavSeries(parseTriRows(snapshot.rows), timestamps);
  if (!values.some((value) => value != null)) throw new Error(`${definition.indexName} has no data for this period.`);
  return {
    benchmarkId,
    indexName: definition.indexName,
    values,
    source: snapshot.source,
    periodStart: new Date(timestamps[0]).toISOString(),
    periodEnd: new Date(timestamps[timestamps.length - 1]).toISOString(),
    retrievedAt: snapshot.retrievedAt,
    comparisonType: 'official-tri',
  };
}

export function fetchNifty500Tri(timestamps: number[]): Promise<TriBenchmark> {
  return fetchTriBenchmark('nifty-500', timestamps);
}
