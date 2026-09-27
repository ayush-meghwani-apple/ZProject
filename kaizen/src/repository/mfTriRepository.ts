import { normalizedNavSeries } from '../core/mfBenchmark';
import { MF_BENCHMARKS, type MfBenchmarkId } from '../core/mfCategoryBenchmark';
import type { NavPoint } from '../core/amfi';

export interface TriBenchmark {
  benchmarkId: MfBenchmarkId;
  indexName: string;
  points: NavPoint[];
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

const snapshotCache = new Map<MfBenchmarkId, Promise<TriSnapshot>>();
const DAILY_REFRESH_KEY = 'kaizen:triRefreshDate';

function localDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function benchmarkBaseUrl(): string {
  const configured = import.meta.env.VITE_TRI_DATA_BASE_URL?.trim();
  return configured
    ? `${configured.replace(/\/+$/, '')}/`
    : `${import.meta.env.BASE_URL}benchmarks/`;
}

function validateSnapshot(snapshot: TriSnapshot, benchmarkId: MfBenchmarkId): TriSnapshot {
  const definition = MF_BENCHMARKS[benchmarkId];
  if (
    snapshot.indexName !== definition.indexName ||
    snapshot.source !== 'NSE Indices Limited' ||
    !Array.isArray(snapshot.rows)
  ) {
    throw new Error(`${definition.indexName} snapshot is invalid.`);
  }
  return snapshot;
}

async function fetchSnapshot(url: string, benchmarkId: MfBenchmarkId): Promise<TriSnapshot> {
  const definition = MF_BENCHMARKS[benchmarkId];
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${definition.indexName} snapshot failed (${response.status})`);
  return validateSnapshot(await response.json() as TriSnapshot, benchmarkId);
}

export function clearTriBenchmarkCache(): void {
  snapshotCache.clear();
}

/** Clear in-memory snapshots at most once per local day when the user syncs. */
export function refreshTriBenchmarkCacheOnceDaily(): boolean {
  const today = localDateKey();
  try {
    if (localStorage.getItem(DAILY_REFRESH_KEY) === today) return false;
    localStorage.setItem(DAILY_REFRESH_KEY, today);
  } catch {
    // In-memory clearing still works when persistent storage is unavailable.
  }
  clearTriBenchmarkCache();
  return true;
}

async function loadTriSnapshot(benchmarkId: MfBenchmarkId): Promise<TriSnapshot> {
  const cached = snapshotCache.get(benchmarkId);
  if (cached) return cached;

  const definition = MF_BENCHMARKS[benchmarkId];
  const configuredBase = import.meta.env.VITE_TRI_DATA_BASE_URL?.trim();
  const datedUrl = `${benchmarkBaseUrl()}${definition.fileName}?date=${localDateKey()}`;
  const request = fetchSnapshot(datedUrl, benchmarkId)
    .catch((error: unknown) => configuredBase
      ? fetchSnapshot(`${import.meta.env.BASE_URL}benchmarks/${definition.fileName}`, benchmarkId)
      : Promise.reject(error))
    .catch((error: unknown) => {
      snapshotCache.delete(benchmarkId);
      throw error;
    });
  snapshotCache.set(benchmarkId, request);
  return request;
}

export function parseTriRows(rows: TriRow[]): NavPoint[] {
  return rows.map((row) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date);
    const date = match
      ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      : new Date(Number.NaN);
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
  const snapshot = await loadTriSnapshot(benchmarkId);
  const points = parseTriRows(snapshot.rows);
  const values = normalizedNavSeries(points, timestamps);
  if (!values.some((value) => value != null)) throw new Error(`${definition.indexName} has no data for this period.`);
  return {
    benchmarkId,
    indexName: definition.indexName,
    points,
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
