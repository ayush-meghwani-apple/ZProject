/**
 * Storage durability helpers.
 *
 * iOS Safari / browsers may evict IndexedDB for sites that aren't marked
 * "persistent" after periods of inactivity. Requesting persistent storage (and
 * installing the app to the Home Screen) makes the local database durable so
 * expenses survive app updates and time away.
 */

export async function ensurePersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function isPersisted(): Promise<boolean> {
  if (!('storage' in navigator) || !navigator.storage?.persisted) return false;
  return navigator.storage.persisted();
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!('storage' in navigator) || !navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
