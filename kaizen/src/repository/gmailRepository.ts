// Gmail read-only access, entirely in the browser (no backend). Uses Google
// Identity Services (GIS) to obtain a short-lived access token, then calls the
// Gmail REST API directly with that bearer token. Nothing is persisted server
// side; the token lives only in memory for the session.
//
// Setup the user does once (see docs/gmail-setup.md): create a Google Cloud
// OAuth "Web application" client, whitelist this app's origin, enable the Gmail
// API, and paste the client id into Settings. The app stays in "Testing" mode
// with the user as the sole test user, so no Google verification is required.

import {
  parseTransactionEmail,
  buildGmailQuery,
  sourceLabel,
  type ParsedTxnEmail,
  type RawEmail,
} from '../core/emailParse';
import {
  getGmailSettings,
  autoSyncWindowDays,
  isHandled,
  setGmailSettings,
  markImported,
  markDismissed,
  clearDismissedMemory,
} from '../core/gmailSettings';
import { guessCategory } from '../core/merchantCategory';
import { detectSalary, SALARY_MIN_AMOUNT } from '../core/salaryDetect';
import { ExpenseRepository } from './expenseRepository';
import { CategoryRepository } from './categoryRepository';
import { PaymentMethodRepository } from './paymentMethodRepository';
import { SalaryCycleRepository } from './salaryCycleRepository';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const PARSER_REVISION_KEY = 'gmail:parserRevision';
const PARSER_REVISION = '4';
const API_TIMEOUT_MS = 20_000;
const FETCH_CONCURRENCY = 8;

// Minimal shape of the GIS token client we rely on (the library is loaded at
// runtime from Google, so we declare only what we use).
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface TokenError {
  type: 'popup_failed_to_open' | 'popup_closed' | 'unknown';
}
interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
            error_callback?: (error: TokenError) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export interface Candidate {
  id: string;
  parsed: ParsedTxnEmail;
  email: RawEmail;
}

const TOKEN_KEY = 'gmail:token';

let accessToken = '';
let tokenExpiry = 0; // epoch millis
let connectPromise: Promise<void> | null = null;
let gisScriptPromise: Promise<void> | null = null;

// Restore a previously-granted token so a page reload (e.g. a new app version)
// never forces re-authorising.
try {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (raw) {
    const t = JSON.parse(raw) as { accessToken?: string; tokenExpiry?: number };
    accessToken = t.accessToken ?? '';
    tokenExpiry = t.tokenExpiry ?? 0;
  }
} catch {
  /* ignore */
}

function persistToken() {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, tokenExpiry }));
  } catch {
    /* ignore */
  }
}

function clearToken() {
  accessToken = '';
  tokenExpiry = 0;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function loadScript(src: string): Promise<void> {
  if (window.google) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;
  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in library.')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google sign-in library.'));
    document.head.appendChild(s);
  });
  return gisScriptPromise.catch((error) => {
    gisScriptPromise = null;
    throw error;
  });
}

export async function prepareAuthorization(): Promise<void> {
  const { clientId } = getGmailSettings();
  if (!clientId) throw new Error('Add your Google OAuth client id in Settings first.');
  await loadScript(GIS_SRC);
  if (!window.google) throw new Error('Google sign-in failed to load.');
}

export function isAuthorizationReady(): boolean {
  return !!window.google;
}

/** True while a usable access token is still in memory. */
export function isConnected(): boolean {
  return !!accessToken && Date.now() < tokenExpiry - 30_000;
}

function requestToken(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      fn();
    };
    const timeout = window.setTimeout(
      () => finish(() => reject(new Error('Gmail authorization timed out.'))),
      60_000,
    );
    try {
      const { clientId } = getGmailSettings();
      const client = window.google?.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error || !resp.access_token) {
            finish(() => reject(new Error(resp.error_description || resp.error || 'Authorization failed.')));
            return;
          }
          finish(() => {
            accessToken = resp.access_token as string;
            tokenExpiry = Date.now() + (resp.expires_in ?? 3600) * 1000;
            persistToken();
            resolve();
          });
        },
        error_callback: (error) => {
          const message = error.type === 'popup_failed_to_open'
            ? 'Google sign-in popup was blocked. Allow popups and tap Sync now again.'
            : error.type === 'popup_closed'
              ? 'Google sign-in was closed before it finished.'
              : 'Google sign-in could not open.';
          finish(() => reject(new Error(message)));
        },
      });
      if (!client) throw new Error('Google sign-in is still loading. Try again in a moment.');
      client.requestAccessToken({ prompt: '' });
    } catch (e) {
      finish(() => reject(e instanceof Error ? e : new Error('Authorization failed.')));
    }
  });
}

/**
 * Ensure a usable access token. Google requires expired browser tokens to be
 * renewed from a user gesture, so only an interactive call may request one.
 */
export function connect(interactive = true): Promise<void> {
  if (isConnected()) return Promise.resolve();
  if (!interactive) return Promise.reject(new Error('Gmail access expired. Tap Sync now once to reconnect.'));
  if (connectPromise) return connectPromise;
  if (!isAuthorizationReady()) {
    return Promise.reject(new Error('Google sign-in is still loading. Try again in a moment.'));
  }
  // requestToken() initializes and opens GIS synchronously inside this call so
  // iOS still recognizes the original button tap as the popup user gesture.
  connectPromise = requestToken().finally(() => {
    connectPromise = null;
  });
  return connectPromise;
}

/** Forget the token (in memory + persisted) and revoke it with Google. */
export function signOut(): void {
  if (accessToken && window.google) {
    window.google.accounts.oauth2.revoke(accessToken);
  }
  clearToken();
}

async function api<T>(path: string): Promise<T> {
  if (!isConnected()) {
    throw new Error('Gmail access expired. Tap Sync now once to reconnect.');
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Gmail did not respond. Check your internet connection and try again.');
    }
    throw new Error('Could not reach Gmail. Check your internet connection and try again.');
  } finally {
    window.clearTimeout(timeout);
  }
  if (res.status === 401) {
    clearToken();
    throw new Error('Gmail access expired. Tap Sync now once to reconnect.');
  }
  if (!res.ok) throw new Error(`Gmail API error ${res.status}.`);
  return res.json() as Promise<T>;
}

// ---- Gmail message → RawEmail -------------------------------------------

interface GmailHeader { name: string; value: string; }
interface GmailPart {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPart;
}

function b64urlDecode(data: string): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

/** Strip HTML to readable text: drop scripts/styles, tags → spaces, decode a
 *  few common entities. Good enough for regex extraction, not for display. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Depth-first search for the best body text: prefer text/plain, else html. */
function extractBody(part?: GmailPart): string {
  if (!part) return '';
  const plains: string[] = [];
  const htmls: string[] = [];
  const walk = (p: GmailPart) => {
    if (p.mimeType === 'text/plain' && p.body?.data) plains.push(b64urlDecode(p.body.data));
    else if (p.mimeType === 'text/html' && p.body?.data) htmls.push(b64urlDecode(p.body.data));
    p.parts?.forEach(walk);
  };
  walk(part);
  if (plains.length) return plains.join('\n');
  if (htmls.length) return htmlToText(htmls.join('\n'));
  return '';
}

function header(part: GmailPart | undefined, name: string): string {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function toRawEmail(msg: GmailMessage): RawEmail {
  return {
    id: msg.id,
    from: header(msg.payload, 'From'),
    subject: header(msg.payload, 'Subject'),
    body: extractBody(msg.payload),
    receivedAt: msg.internalDate ? Number(msg.internalDate) : undefined,
  };
}

// ---- Public sync ---------------------------------------------------------

interface ListResponse {
  messages?: { id: string }[];
  nextPageToken?: string;
}

async function mapConcurrent<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, items.length) }, runWorker));
  return results;
}

/** Shared Gmail transport used by domain-specific importers. Authentication,
 * pagination and MIME decoding live here; each importer owns its query,
 * parser, de-duplication state and persistence. */
export async function fetchRawEmails(
  query: string,
  skip: (id: string) => boolean = () => false,
): Promise<RawEmail[]> {
  const ids: string[] = [];
  let pageToken = '';
  do {
    const page = await api<ListResponse>(
      `/messages?maxResults=500&q=${encodeURIComponent(query)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
    );
    ids.push(...(page.messages ?? []).map((message) => message.id));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);

  return mapConcurrent(ids.filter((messageId) => !skip(messageId)), async (id) => {
    const message = await api<GmailMessage>(`/messages/${id}?format=full`);
    return toRawEmail(message);
  });
}

async function prepareParserRevision(): Promise<void> {
  try {
    if (localStorage.getItem(PARSER_REVISION_KEY) === PARSER_REVISION) return;
  } catch {
    return;
  }

  const expenses = await ExpenseRepository.getExpenses();
  const falsePositives = expenses.filter(
    (expense) =>
      expense.autoImported &&
      /no\s+further\s+cibil\s+check\s+required|pre[-\s]?approved\s+personal\s+loan/i.test(
        expense.rawText ?? '',
      ),
  );
  for (const expense of falsePositives) await ExpenseRepository.deleteExpense(expense.id);
  clearDismissedMemory();
  try {
    localStorage.setItem(PARSER_REVISION_KEY, PARSER_REVISION);
  } catch {
    /* ignore */
  }
}

/**
 * Fetch recent bank/card emails, parse each into a candidate transaction, and
 * drop any Gmail message already imported or dismissed. Sorted newest first.
 * Requires an active connection (call {@link connect} first).
 */
export async function sync(days?: number): Promise<Candidate[]> {
  await prepareParserRevision();
  const settings = getGmailSettings();
  const window = days ?? settings.syncDays;
  const emails = await fetchRawEmails(buildGmailQuery(window), isHandled);
  const candidates: Candidate[] = [];
  for (const email of emails) {
    const parsed = parseTransactionEmail(email);
    if (parsed.amount === null) continue; // nothing to import
    candidates.push({ id: email.id as string, parsed, email });
  }

  candidates.sort((a, b) => (b.email.receivedAt ?? 0) - (a.email.receivedAt ?? 0));
  return candidates;
}

export interface ImportResult {
  /** New expenses created from spends. */
  imported: number;
  /** Credits / statements that were skipped and remembered (won't return). */
  skipped: number;
  /** Salary credits detected → new salary cycles started. */
  salary: number;
}

// ---- Observable sync state (for the Settings UI to show Syncing→Synced) ----
export type SyncPhase = 'idle' | 'syncing' | 'done' | 'error';
export interface SyncState {
  phase: SyncPhase;
  message: string;
  result?: ImportResult;
}
let syncState: SyncState = { phase: 'idle', message: '' };
let autoSyncPromise: Promise<ImportResult> | null = null;
const syncListeners = new Set<(s: SyncState) => void>();
function emitSync(next: SyncState) {
  syncState = next;
  syncListeners.forEach((l) => l(syncState));
}
export function getSyncState(): SyncState {
  return syncState;
}
export function subscribeSync(fn: (s: SyncState) => void): () => void {
  syncListeners.add(fn);
  return () => {
    syncListeners.delete(fn);
  };
}
function summarize(r: ImportResult): string {
  if (r.imported === 0 && r.salary === 0) {
    return r.skipped > 0
      ? `Checked your emails · nothing new to add (${r.skipped} credit/statement skipped)`
      : "Checked your emails · no new transactions — you're all caught up";
  }
  const parts = [`${r.imported} spend${r.imported === 1 ? '' : 's'}`];
  if (r.salary) parts.push(`${r.salary} salary`);
  if (r.skipped) parts.push(`${r.skipped} skipped`);
  return `Synced · ${parts.join(' · ')}`;
}

/** yyyy-mm-dd → ISO at local midnight, matching the rest of the app. */
function isoFromDate(date: string | null): string | undefined {
  return date ? new Date(`${date}T00:00:00`).toISOString() : undefined;
}

/**
 * Turn fetched candidates into real expenses. Spends (debits) become expenses
 * flagged `autoImported` + unreviewed, auto-categorised from the merchant, and
 * tagged with a per-card payment method. Credits and statements are dismissed
 * so they never resurface. Returns how many were imported vs skipped.
 */
export async function importCandidates(candidates: Candidate[]): Promise<ImportResult> {
  const [categories, subcategories, aliases, methods] = await Promise.all([
    CategoryRepository.getCategories(),
    CategoryRepository.getSubcategories(),
    CategoryRepository.getAliases(),
    PaymentMethodRepository.list(),
  ]);
  const methodId = new Map(methods.map((m) => [m.name.toLowerCase(), m.id]));
  const salaryMinAmount = SALARY_MIN_AMOUNT;
  const salaryEvents: { date: string; amount: number; note: string }[] = [];

  async function ensureMethod(name: string): Promise<string> {
    const hit = methodId.get(name.toLowerCase());
    if (hit) return hit;
    const created = await PaymentMethodRepository.add(name, '💳');
    methodId.set(name.toLowerCase(), created.id);
    return created.id;
  }

  let imported = 0;
  let skipped = 0;
  for (const c of candidates) {
    const p = c.parsed;

    // Salary credit? Start a cycle instead of importing an expense.
    const verdict = detectSalary(p, `${c.email.subject}\n${c.email.body}`, {
      minAmount: salaryMinAmount,
      windowDays: 3,
    });
    if (verdict.isSalary && p.amount !== null && p.date) {
      salaryEvents.push({
        date: p.date,
        amount: p.amount,
        note: `${sourceLabel(p.source)} · Salary`,
      });
      markImported(c.id);
      continue;
    }

    // Promotional / EMI-conversion emails and declined/failed transactions are
    // not real spends.
    if (p.kind === 'promo' || p.kind === 'failed') {
      markDismissed(c.id);
      skipped++;
      continue;
    }

    // IDFC is a salary passthrough (funds are moved to SBI, which tracks the
    // real spends), so ignore every IDFC debit to avoid double-counting.
    if (p.source === 'idfc-savings' && p.direction === 'debit') {
      markDismissed(c.id);
      skipped++;
      continue;
    }

    const isSpend = p.direction === 'debit' && p.kind !== 'statement' && p.amount !== null;
    if (!isSpend) {
      // Credits, statements, and anything clearly not a spend: remember + skip.
      if (p.direction === 'credit' || p.kind === 'statement') {
        markDismissed(c.id);
        skipped++;
      }
      continue;
    }
    const pmId = await ensureMethod(sourceLabel(p.source));
    const guess = guessCategory(p.merchant, categories, subcategories, aliases);
    // Payment method already shows the card/account, so the note is just the payee.
    const note = p.merchant ?? undefined;
    await ExpenseRepository.addExpense({
      amount: p.amount as number,
      date: isoFromDate(p.date),
      categoryId: guess.categoryId,
      paymentMethodId: pmId,
      note,
      rawText: p.raw.subject,
      autoImported: true,
    });
    markImported(c.id);
    imported++;
  }

  // Start salary cycles oldest-first so cycle boundaries stay chronological.
  // Banks often send the SAME salary alert twice (e.g. two IDFC emails minutes
  // apart) — dedupe by day + amount so it counts once. Different-month salaries
  // (different day) are kept separate.
  const seenSalary = new Set<string>();
  const uniqueSalary = salaryEvents.filter((s) => {
    const key = `${s.date.slice(0, 10)}|${Math.round(s.amount)}`;
    if (seenSalary.has(key)) return false;
    seenSalary.add(key);
    return true;
  });
  uniqueSalary.sort((a, b) => a.date.localeCompare(b.date));
  for (const s of uniqueSalary) {
    await SalaryCycleRepository.receiveSalaryFromEmail(
      isoFromDate(s.date) as string,
      s.amount,
      s.note,
    );
  }

  setGmailSettings({ lastImported: imported, lastSkipped: skipped, lastSalary: uniqueSalary.length });
  return { imported, skipped, salary: uniqueSalary.length };
}

/**
 * Fetch + import in one go. `interactive` shows the Google consent popup when a
 * fresh token is needed; pass false for a silent background sync on app open.
 */
export async function syncAndImport(
  days?: number,
  opts: { interactive?: boolean } = {},
): Promise<ImportResult> {
  emitSync({ phase: 'syncing', message: 'Reading emails…' });
  try {
    if (!isConnected()) await connect(opts.interactive ?? true);
    const candidates = await sync(days);
    const result = await importCandidates(candidates);
    setGmailSettings({ lastSyncAt: new Date().toISOString() });
    emitSync({ phase: 'done', message: summarize(result), result });
    return result;
  } catch (e) {
    emitSync({ phase: 'error', message: e instanceof Error ? e.message : 'Sync failed.' });
    throw e;
  }
}

/**
 * Diagnostic: list every email the sync fetches (ignoring the imported/dismissed
 * filter) with how the parser classifies each, so we can tell "not fetched"
 * (sender) apart from "fetched but skipped" (parser). One line per email.
 */
export async function diagnose(days?: number): Promise<string[]> {
  if (!isConnected()) await connect(true);
  const window = days ?? getGmailSettings().syncDays;
  const q = encodeURIComponent(buildGmailQuery(window));
  const list = await api<ListResponse>(`/messages?maxResults=50&q=${q}`);
  const ids = (list.messages ?? []).map((m) => m.id);
  const lines = [`Fetched ${ids.length} email(s) · window ${window}d`];
  const details = await mapConcurrent(ids, async (id) => {
    const msg = await api<GmailMessage>(`/messages/${id}?format=full`);
    const email = toRawEmail(msg);
    const p = parseTransactionEmail(email);
    const domain = email.from.match(/@([^>\s]+)/)?.[1] ?? email.from;
    return `${domain} | ${p.source}/${p.kind} | ${p.amount ?? 'no-amt'} ${p.direction ?? '-'} | ${email.subject.slice(0, 32)}`;
  });
  lines.push(...details);
  return lines;
}

/**
 * Best-effort silent sync used on app open. Never pops a consent dialog and
 * never throws — returns 0/0/0 when not (yet) authorised.
 */
async function runAutoSync(): Promise<ImportResult> {
  const zero: ImportResult = { imported: 0, skipped: 0, salary: 0 };
  const settings = getGmailSettings();
  if (!settings.clientId) return zero;
  if (!isConnected()) {
    void prepareAuthorization().catch(() => undefined);
    emitSync({ phase: 'error', message: 'Gmail access expired. Tap Sync now once to reconnect.' });
    return zero;
  }
  emitSync({ phase: 'syncing', message: 'Syncing…' });
  try {
    const candidates = await sync(autoSyncWindowDays(settings.lastAutoSyncAt, settings.syncDays));
    const result = await importCandidates(candidates);
    const completedAt = new Date().toISOString();
    setGmailSettings({ lastSyncAt: completedAt, lastAutoSyncAt: completedAt });
    emitSync({ phase: 'done', message: summarize(result), result });
    return result;
  } catch (error) {
    emitSync({
      phase: 'error',
      message: error instanceof Error ? error.message : 'Automatic Gmail sync failed.',
    });
    return zero;
  }
}

export function autoSync(): Promise<ImportResult> {
  if (autoSyncPromise) return autoSyncPromise;
  autoSyncPromise = runAutoSync().finally(() => {
    autoSyncPromise = null;
  });
  return autoSyncPromise;
}

export const GmailRepository = {
  isConnected,
  isAuthorizationReady,
  prepareAuthorization,
  connect,
  signOut,
  sync,
  importCandidates,
  syncAndImport,
  autoSync,
  getSyncState,
  subscribeSync,
  diagnose,
  fetchRawEmails,
};
