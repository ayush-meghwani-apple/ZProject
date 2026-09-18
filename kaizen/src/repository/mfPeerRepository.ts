import { fetchNavHistoryRange } from '../core/amfi';
import { weightedNavIndex } from '../core/mfBenchmark';

const LATEST_URL = 'https://api.mfapi.in/mf/latest';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOG_KEY = 'kaizen:mf-peer-catalog:v1';
const BENCHMARK_PREFIX = 'kaizen:mf-peer-benchmark:v2:';
const MAX_PEERS = 12;
const MIN_PEERS = 3;

export interface PeerScheme {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  schemeCategory: string;
}

export interface PeerBenchmark {
  category: string;
  values: (number | null)[];
  sampleSize: number;
  source: 'AMFI via MFAPI';
  periodStart: string;
  periodEnd: string;
  retrievedAt: string;
  comparisonType: 'category-peer-proxy';
}

interface CacheEnvelope<T> {
  at: number;
  value: T;
}

export function readFreshCache<T>(raw: string | null, now = Date.now()): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    return Number.isFinite(parsed.at) && now - parsed.at < CACHE_TTL_MS ? parsed.value : null;
  } catch {
    return null;
  }
}

function readCache<T>(key: string): T | null {
  try {
    return readFreshCache<T>(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value } satisfies CacheEnvelope<T>));
  } catch {
    // Comparisons still work when storage is unavailable or full.
  }
}

function isDirectGrowth(name: string): boolean {
  return /\bdirect\b/i.test(name) && /\bgrowth\b/i.test(name) && !/\b(idcw|dividend|bonus)\b/i.test(name);
}

function baseSchemeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(?:direct|regular)\s*(?:plan)?\b/g, '')
    .replace(/\b(?:growth|option)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function selectCategoryPeers(
  catalog: PeerScheme[],
  category: string,
  excludedCodes: number[] = [],
  limit = MAX_PEERS,
): PeerScheme[] {
  const excluded = new Set(excludedCodes);
  const seenFunds = new Set<string>();
  const seenHouses = new Set<string>();
  const candidates = catalog
    .filter((scheme) => scheme.schemeCategory === category && isDirectGrowth(scheme.schemeName) && !excluded.has(scheme.schemeCode))
    .sort((a, b) => a.fundHouse.localeCompare(b.fundHouse) || a.schemeName.localeCompare(b.schemeName));
  const unique = candidates.filter((scheme) => {
    const key = baseSchemeName(scheme.schemeName);
    if (!key || seenFunds.has(key)) return false;
    seenFunds.add(key);
    return true;
  });
  const diverse = unique.filter((scheme) => {
    if (seenHouses.has(scheme.fundHouse)) return false;
    seenHouses.add(scheme.fundHouse);
    return true;
  });
  return [...diverse, ...unique.filter((scheme) => !diverse.includes(scheme))].slice(0, Math.max(0, limit));
}

async function directGrowthCatalog(): Promise<PeerScheme[]> {
  const cached = readCache<PeerScheme[]>(CATALOG_KEY);
  if (cached) return cached;
  const response = await fetch(LATEST_URL);
  if (!response.ok) throw new Error(`Peer catalog fetch failed (${response.status})`);
  const raw = (await response.json()) as Array<{
    schemeCode?: number;
    schemeName?: string;
    fundHouse?: string;
    schemeCategory?: string;
  }>;
  const catalog = (Array.isArray(raw) ? raw : [])
    .filter((scheme) => Number.isFinite(Number(scheme.schemeCode)) && scheme.schemeName && scheme.schemeCategory)
    .map((scheme) => ({
      schemeCode: Number(scheme.schemeCode),
      schemeName: scheme.schemeName ?? '',
      fundHouse: scheme.fundHouse ?? '',
      schemeCategory: scheme.schemeCategory ?? '',
    }))
    .filter((scheme) => isDirectGrowth(scheme.schemeName));
  writeCache(CATALOG_KEY, catalog);
  return catalog;
}

function benchmarkKey(category: string, timestamps: number[], excludedCodes: number[]): string {
  const signature = `${category}|${timestamps[0]}|${timestamps[timestamps.length - 1]}|${timestamps.length}|${[...excludedCodes].sort((a, b) => a - b).join(',')}`;
  let hash = 0;
  for (let index = 0; index < signature.length; index++) hash = (hash * 31 + signature.charCodeAt(index)) | 0;
  return `${BENCHMARK_PREFIX}${Math.abs(hash).toString(36)}`;
}

export async function fetchCategoryBenchmark(
  category: string,
  timestamps: number[],
  excludedCodes: number[] = [],
): Promise<PeerBenchmark> {
  if (!category || timestamps.length < 2) throw new Error('Category comparison needs a valid date range.');
  const key = benchmarkKey(category, timestamps, excludedCodes);
  const cached = readCache<PeerBenchmark>(key);
  if (cached?.values.length === timestamps.length) return cached;

  const peers = selectCategoryPeers(await directGrowthCatalog(), category, excludedCodes);
  if (peers.length < MIN_PEERS) throw new Error('Not enough Direct Growth peers are available for this category.');
  const start = new Date(timestamps[0]);
  start.setDate(start.getDate() - 7);
  const end = new Date(timestamps[timestamps.length - 1]);
  const histories = await Promise.allSettled(peers.map((peer) => fetchNavHistoryRange(peer.schemeCode, start, end)));
  const valid = histories
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchNavHistoryRange>>> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((history) => history.meta.schemeCategory === category)
    .map((history) => ({ points: history.points }));
  const indexed = weightedNavIndex(valid, timestamps);
  if (indexed.sampleSize < MIN_PEERS) throw new Error('Not enough peer histories cover the selected period.');
  const benchmark: PeerBenchmark = {
    category,
    values: indexed.values,
    sampleSize: indexed.sampleSize,
    source: 'AMFI via MFAPI',
    periodStart: new Date(timestamps[0]).toISOString(),
    periodEnd: new Date(timestamps[timestamps.length - 1]).toISOString(),
    retrievedAt: new Date().toISOString(),
    comparisonType: 'category-peer-proxy',
  };
  writeCache(key, benchmark);
  return benchmark;
}