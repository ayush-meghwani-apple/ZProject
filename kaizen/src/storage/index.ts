import { indexedDbAdapter } from './indexedDbAdapter';
import type { StorageAdapter } from './StorageAdapter';

/**
 * The single active storage engine for the whole app.
 *
 * To migrate to a backend later, implement StorageAdapter in a new file
 * (e.g. restAdapter.ts) and change ONLY this line. Nothing else in the app
 * imports a concrete storage engine.
 */
export const storage: StorageAdapter = indexedDbAdapter;
