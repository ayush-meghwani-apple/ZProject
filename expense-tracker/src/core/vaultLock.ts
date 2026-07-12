/**
 * Passcode lock for the Vault sub-app. A salted SHA-256 hash of the PIN is kept
 * in localStorage (never the PIN itself). This gates the UI so the savings
 * values aren't visible at a glance — a soft, local lock, appropriate for a
 * personal on-device app.
 */

const KEY = 'kaizen:vaultLock';

interface Stored {
  salt: string;
  hash: string;
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hash(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

/** Whether a PIN has been set up yet. */
export function hasPin(): boolean {
  return read() !== null;
}

/** Create/replace the PIN. */
export async function setPin(pin: string): Promise<void> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const h = await hash(pin, salt);
  localStorage.setItem(KEY, JSON.stringify({ salt, hash: h } satisfies Stored));
}

/** Check a PIN against the stored hash. */
export async function verifyPin(pin: string): Promise<boolean> {
  const s = read();
  if (!s) return false;
  return (await hash(pin, s.salt)) === s.hash;
}

/** Remove the PIN (used when resetting the vault). */
export function clearPin(): void {
  localStorage.removeItem(KEY);
}
