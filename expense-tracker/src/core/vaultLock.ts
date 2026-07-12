/**
 * Vault security.
 *
 * The PIN is never stored anywhere. From it we derive an AES-GCM key with
 * PBKDF2 (200k iterations) and use that key to encrypt EVERY vault entry at
 * rest — so the raw IndexedDB (and any backup) only ever holds ciphertext, not
 * your savings figures. A small "verifier" blob lets us check a PIN is correct
 * without keeping the PIN. Only the derivation parameters (salt, iterations) and
 * that verifier live in localStorage; none of them reveal the PIN, and PBKDF2
 * makes guessing it slow. Those params are also carried in a backup so an
 * encrypted vault can be restored on another device with the same PIN.
 */

const KEY = 'kaizen:vaultLock';
const ITER = 200000;
const VERIFIER_TEXT = 'kaizen-vault-verifier-v2';

export interface VaultLockMeta {
  v: 2;
  salt: string; // base64
  iter: number;
  verifier: string; // "ivB64:ctB64" of VERIFIER_TEXT
}

const te = new TextEncoder();
const td = new TextDecoder();

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function readMeta(): VaultLockMeta | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VaultLockMeta) : null;
  } catch {
    return null;
  }
}

/** Whether a PIN has been set up yet. */
export function hasPin(): boolean {
  return readMeta() !== null;
}

/** The (non-secret) lock params — carried in backups so a vault can be restored. */
export function getLockMeta(): VaultLockMeta | null {
  return readMeta();
}

/** Restore lock params (from a backup). */
export function setLockMeta(
  meta: { v?: number; salt: string; iter: number; verifier: string } | null | undefined,
): void {
  if (meta && meta.salt && meta.verifier) {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 2, salt: meta.salt, iter: meta.iter, verifier: meta.verifier }),
    );
  }
}

/** Remove the PIN/lock (used when resetting the vault). */
export function clearPin(): void {
  localStorage.removeItem(KEY);
}

// WebCrypto's typings (lib.dom) currently reject a plain Uint8Array as a
// BufferSource under strict TS; these are freshly-allocated buffers, so the cast
// is safe.
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

async function deriveKey(pin: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', bs(te.encode(pin)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bs(salt), iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable: the key can't be read out, only used
    ['encrypt', 'decrypt'],
  );
}

async function encWith(key: CryptoKey, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(iv) }, key, bs(te.encode(plain)));
  return `${b64(iv)}:${b64(ct)}`;
}

async function decWith(key: CryptoKey, packed: string): Promise<string> {
  const [ivB, ctB] = packed.split(':');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bs(unb64(ivB)) }, key, bs(unb64(ctB)));
  return td.decode(pt);
}

// Legacy (v1) lock verification: a salted SHA-256 hash of the PIN, used before
// encryption-at-rest. Kept only so an early adopter's PIN still works; on a
// successful unlock we immediately upgrade them to the v2 encrypted scheme.
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
async function legacyHash(pin: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bs(te.encode(`${salt}:${pin}`)));
  return toHex(digest);
}

/** Create/replace the PIN. Returns the derived key for the unlocked session. */
export async function createPin(pin: string): Promise<CryptoKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt, ITER);
  const verifier = await encWith(key, VERIFIER_TEXT);
  localStorage.setItem(
    KEY,
    JSON.stringify({ v: 2, salt: b64(salt), iter: ITER, verifier } satisfies VaultLockMeta),
  );
  return key;
}

/** Try to unlock with a PIN. Returns the key on success, null on a wrong PIN. */
export async function unlock(pin: string): Promise<CryptoKey | null> {
  let meta: (VaultLockMeta & { hash?: string }) | null;
  try {
    const raw = localStorage.getItem(KEY);
    meta = raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  if (!meta) return null;
  // Legacy v1 lock (salted SHA-256, plaintext vault): verify the old way, then
  // upgrade to the encrypted v2 scheme (the plaintext entries are encrypted on
  // load). This keeps early adopters from being locked out or losing data.
  if (meta.hash && !meta.verifier) {
    const ok = (await legacyHash(pin, meta.salt)) === meta.hash;
    return ok ? await createPin(pin) : null;
  }
  try {
    const key = await deriveKey(pin, unb64(meta.salt), meta.iter);
    const check = await decWith(key, meta.verifier);
    return check === VERIFIER_TEXT ? key : null;
  } catch {
    return null;
  }
}

/** Encrypt an object for storage with the session key. */
export function encryptJson(key: CryptoKey, obj: unknown): Promise<string> {
  return encWith(key, JSON.stringify(obj));
}

/** Decrypt an object previously stored with {@link encryptJson}. */
export async function decryptJson<T>(key: CryptoKey, packed: string): Promise<T> {
  return JSON.parse(await decWith(key, packed)) as T;
}
