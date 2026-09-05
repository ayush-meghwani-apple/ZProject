// Pure email → transaction extraction. No React, no storage, no network.
// Given a bank/card alert email (from, subject, body text), it pulls out the
// amount, direction, merchant, date, and which account/card it hit. Built for
// the user's senders: HSBC credit card, ICICI Bank credit card, SBI Card
// (RuPay credit card) and SBI savings-account debit alerts (which cover UPI
// payments made via Paytm / CRED / PhonePe from the SBI savings account).

export type TxnDirection = 'debit' | 'credit';

/** Which of the user's accounts an email belongs to. */
export type TxnSource =
  | 'sbicard' //      SBI credit card (RuPay, used for UPI)
  | 'hsbc-cc' //      HSBC credit card
  | 'icici-cc' //     ICICI Bank credit card
  | 'bobcard-cc' //   Bank of Baroda credit card
  | 'au-cc' //        AU Small Finance Bank credit card
  | 'sbi-savings' //  SBI savings account (UPI / debit alerts)
  | 'idfc-savings' //  IDFC FIRST Bank account (salary credit)
  | 'unknown';

/** Shape of the email as we read it. */
export type TxnKind =
  | 'card' //       a single card spend
  | 'account' //    a single account debit/credit
  | 'statement' //  a bill / e-statement summary
  | 'promo' //      a promotional / EMI-conversion email (not a real transaction)
  | 'failed' //     a declined / failed transaction (no money moved)
  | 'unknown';

export interface RawEmail {
  from: string; //    full From header, e.g. "SBI Card <noreply@sbicard.com>"
  subject: string;
  body: string; //    plain-text body (HTML already stripped)
  /** Gmail message id, if known — used downstream for de-duplication. */
  id?: string;
  /** Epoch millis the email was received, used as a date fallback. */
  receivedAt?: number;
}

export interface ParsedTxnEmail {
  amount: number | null;
  direction: TxnDirection | null;
  merchant: string | null;
  /** ISO date (yyyy-mm-dd) when the transaction happened, if found. */
  date: string | null;
  /** Last 4 digits of the card/account the email refers to. */
  accountLast4: string | null;
  source: TxnSource;
  kind: TxnKind;
  /** 0..1 rough confidence that this is a real, importable transaction. */
  confidence: number;
  raw: { from: string; subject: string; id?: string };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

// A currency amount: ₹ / Rs / Rs. / INR followed by a number with optional
// thousands separators and up to two decimals. The `g` flag lets us scan every
// occurrence so we can skip "available limit/balance" figures.
const CURRENCY_RE = /(?:₹|rs\.?|inr)\s*([0-9](?:[0-9,]*)(?:\.\d{1,2})?)/gi;

// Words that mean the number next to them is a balance/limit, NOT the txn.
const NON_TXN_CONTEXT = /(available|avbl|avl|balance|limit|outstanding|remaining|total\s+due|min(?:imum)?\s+(?:amount\s+)?due)/i;

const DEBIT_WORDS = /(spent|debited|debit|paid|purchase|withdrawn|used\s+for\s+a\s+transaction|transaction\s+of|txn\s+of|charged)/i;
// Unambiguous spend words. Lets a clear credit win over weak/ambiguous debit
// wording like "transaction of"; "used for a transaction" is included so a stray
// credit-ish word in a card alert's footer can't flip a real spend (e.g. HSBC).
const STRONG_DEBIT_WORDS = /(spent|debited|withdrawn|purchase|charged|paid|used\s+for\s+a\s+transaction)/i;
const CREDIT_WORDS = /(credited|received|refund(?:ed)?|reversed|deposited)/i;
const STATEMENT_WORDS = /(statement|e-?statement|bill\s+generated|total\s+amount\s+due|minimum\s+amount\s+due)/i;

// Promotional / EMI-conversion emails (e.g. SBI Card "Convert your recent trans.
// into Flexipay EMI!") quote a past amount but are NOT new transactions.
const PROMO_RE = /(convert\s+your\s+recent|flexipay|book\s+flexipay|processing\s+fee\s+on\s+converting|into\s+(?:easy\s+)?(?:flexipay\s+)?emis?|pre[-\s]?approved\s+personal\s+loan|personal\s+loan\s+on\s+(?:your\s+)?credit\s+card|apply\s+now|no\s+further\s+cibil\s+check)/i;
// Phrases that only appear in a genuine transaction line — used to rescue a real
// alert that also carries a promo footer.
const REAL_TXN_RE = /(spent\s+on\s+your|debited|withdrawn|used\s+for\s+a\s+transaction|transaction\s+status\s*:?\s*success)/i;
// A declined / failed transaction never actually moved money, so it must not be
// imported (e.g. a first YONO attempt that failed OTP before a successful retry).
const FAILED_RE = /\b(declined|failed|unsuccessful|not\s+successful|rejected)\b/i;
// Non-transaction notifications (OTP, login, limit changes). Matched on the
// SUBJECT only, so the "never share your OTP" footer on a real alert can't trip
// it. These carry an amount (the OTP is for a pending txn) but must not import.
const NOTICE_SUBJECT_RE = /\botp\b|one[-\s]?time[-\s]?password|log\s?on|logged|sign[-\s]?in|\blogin\b|transaction\s+limits/i;

function toNumber(s: string): number {
  return parseFloat(s.replace(/,/g, ''));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Normalise a two-digit year to 20xx (bank alerts are always recent). */
function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Pulls the first date out of a bank email. Handles the common Indian formats:
 *   30 Aug 2025 · 30-Aug-2025 · Aug 30, 2025 · 30/08/25 · 30-08-2025
 * Returns an ISO yyyy-mm-dd string, or null if nothing parseable is found.
 */
export function extractDate(text: string): string | null {
  // 30 Aug 2025 | 30-Aug-25 | 30 August 2025
  let m = text.match(/\b(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(\d{2,4})\b/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${fullYear(+m[3])}-${pad2(mon)}-${pad2(+m[1])}`;
  }
  // Aug 30, 2025 | August 30 2025
  m = text.match(/\b([A-Za-z]{3,9})[\s\-](\d{1,2})[\s,]+(\d{2,4})\b/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) return `${fullYear(+m[3])}-${pad2(mon)}-${pad2(+m[2])}`;
  }
  // 30/08/2025 | 30-08-25 | 30.08.2025  (day first, Indian convention)
  m = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) {
    const d = +m[1], mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${fullYear(+m[3])}-${pad2(mo)}-${pad2(d)}`;
    }
  }
  return null;
}

/**
 * Chooses the transaction amount from a body, skipping figures that are clearly
 * a balance or credit limit. Picks the amount tied to a spend/credit keyword
 * when possible, otherwise the first "clean" currency figure.
 */
export function extractAmount(text: string): number | null {
  const flat = text.replace(/\s+/g, ' ');
  let firstClean: number | null = null;
  let afterKeyword: number | null = null;
  let beforeKeyword: number | null = null;

  for (const match of flat.matchAll(CURRENCY_RE)) {
    const value = toNumber(match[1]);
    if (!isFinite(value) || value <= 0) continue;
    const start = match.index ?? 0;
    const before = flat.slice(Math.max(0, start - 32), start);
    const after = flat.slice(start + match[0].length, start + match[0].length + 24);
    if (NON_TXN_CONTEXT.test(before) || NON_TXN_CONTEXT.test(after)) continue;
    if (firstClean === null) firstClean = value;
    // "Rs.170 spent / debited / credited" — a keyword right AFTER the amount is
    // the strongest signal (Indian card alerts read "Rs.X spent at …"). This
    // beats promo/footer figures that appear earlier in the email body.
    if (afterKeyword === null && (DEBIT_WORDS.test(after) || CREDIT_WORDS.test(after))) {
      afterKeyword = value;
    }
    if (beforeKeyword === null && (DEBIT_WORDS.test(before) || CREDIT_WORDS.test(before))) {
      beforeKeyword = value;
    }
  }
  return afterKeyword ?? beforeKeyword ?? firstClean;
}

/** Reads the last 4 digits of a card/account: "ending 1234", "XX1234", "x1234". */
export function extractLast4(text: string): string | null {
  const m =
    text.match(/(?:ending|end(?:ing)?\s+in|no\.?\s*[xX*]+|[xX*]{2,}|card\s+no\.?|a\/?c\s+no\.?)\s*[xX*\s-]*?(\d{4})\b/) ||
    text.match(/\b[xX*]{2,}(\d{4})\b/);
  return m ? m[1] : null;
}

/**
 * Best-effort merchant name. Bank alerts describe the counterparty a handful of
 * predictable ways: "at MERCHANT", "Info: MERCHANT", "towards MERCHANT",
 * "to VPA name@bank". We stop at the next clause (on/dated/.).
 */
export function extractMerchant(text: string): string | null {
  const flat = text.replace(/\s+/g, ' ');
  const patterns: RegExp[] = [
    /\bInfo:\s*([^.\n]+?)(?:\.|$)/i,
    /\bbeneficiary\s+name\s+([A-Za-z][^\n]*?)(?:\s+beneficiary|\s+account\b|\.|$)/i,
    /\bat\s+([A-Z0-9].{1,59}?)(?:\s+on\b|\s+dated\b|\.(?:\s|$)|$)/i,
    /\btowards\s+([^.\n]+?)(?:\s+on\b|\.|$)/i,
    /\bto\s+VPA\s+([^\s.]+)/i,
    /\btrf\s+to\s+([^.\n]+?)(?:\s+on\b|\s+Ref\b|\.|$)/i,
    /\bto\s+([A-Z0-9][^.\n]*?)(?:\s+on\b|\s+Ref\b|\.|$)/,
  ];
  for (const re of patterns) {
    const m = flat.match(re);
    if (m && m[1]) {
      const name = m[1].trim().replace(/\s{2,}/g, ' ');
      if (name.length >= 2 && name.length <= 60) return name;
    }
  }
  return null;
}

/** Identify which of the user's accounts an email came from. */
export function detectSource(from: string, subject: string, body: string): TxnSource {
  const f = from.toLowerCase();
  const hay = `${subject} ${body}`.toLowerCase();
  if (f.includes('sbicard') || /sbi\s*card/.test(hay)) return 'sbicard';
  if (f.includes('hsbc') || hay.includes('hsbc')) return 'hsbc-cc';
  if (f.includes('bobcard') || hay.includes('bobcard')) return 'bobcard-cc';
  if (f.includes('aubank') || /au\s+(?:bank\s+)?credit\s+card/.test(hay)) return 'au-cc';
  if (f.includes('idfc') || hay.includes('idfc first')) return 'idfc-savings';
  if (f.includes('icici') || hay.includes('icici')) {
    // ICICI sends both bank and card alerts; we only track the credit card.
    return /credit\s*card/.test(hay) ? 'icici-cc' : 'unknown';
  }
  if (f.includes('sbi') || hay.includes('state bank')) {
    // SBI savings alert (a/c debited) — not the SBI card, handled above.
    if (/a\/?c|account|savings|upi/.test(hay)) return 'sbi-savings';
  }
  return 'unknown';
}

/**
 * Parse a single bank/card email into a candidate transaction. Pure and
 * defensive: any field it cannot find comes back null and lowers confidence,
 * so the UI can surface low-confidence rows for manual review instead of
 * silently importing something wrong.
 */
export function parseTransactionEmail(email: RawEmail): ParsedTxnEmail {
  const { from, subject, body } = email;
  const text = `${subject}\n${body}`;
  const source = detectSource(from, subject, body);

  const isBobTransactionConfirmation =
    source === 'bobcard-cc' && /transaction\s+confirmation/i.test(subject);
  const isStatement =
    STATEMENT_WORDS.test(text) && !DEBIT_WORDS.test(subject) && !isBobTransactionConfirmation;
  const isFailed = FAILED_RE.test(text);
  const isPromo =
    (PROMO_RE.test(text) && !REAL_TXN_RE.test(text)) || NOTICE_SUBJECT_RE.test(subject);
  const amount = extractAmount(text);

  let direction: TxnDirection | null = null;
  if (CREDIT_WORDS.test(text) && !STRONG_DEBIT_WORDS.test(text)) direction = 'credit';
  else if (DEBIT_WORDS.test(text)) direction = 'debit';
  // Credit-card spends read as a debit even when worded "used for a transaction".
  if (
    direction === null &&
    (source === 'sbicard' ||
      source === 'hsbc-cc' ||
      source === 'icici-cc' ||
      source === 'bobcard-cc' ||
      source === 'au-cc')
  ) {
    direction = 'debit';
  }

  const dateFromBody = extractDate(text);
  const date =
    dateFromBody ??
    (email.receivedAt ? new Date(email.receivedAt).toISOString().slice(0, 10) : null);

  const kind: TxnKind = isFailed
    ? 'failed'
    : isPromo
      ? 'promo'
      : isStatement
        ? 'statement'
        : source === 'sbi-savings'
          ? 'account'
          : source === 'unknown'
            ? 'unknown'
            : 'card';

  const merchant =
    kind === 'statement' || kind === 'promo' || kind === 'failed' ? null : extractMerchant(text);

  // Confidence: known sender + amount + direction is the strong signal;
  // merchant and an explicit in-body date add polish.
  let confidence = 0;
  if (source !== 'unknown') confidence += 0.4;
  if (amount !== null) confidence += 0.3;
  if (direction !== null) confidence += 0.1;
  if (merchant !== null) confidence += 0.1;
  if (dateFromBody !== null) confidence += 0.1;
  if (kind === 'statement' || kind === 'promo' || kind === 'failed')
    confidence = Math.min(confidence, 0.4);

  return {
    amount,
    direction,
    merchant,
    date,
    accountLast4: extractLast4(text),
    source,
    kind,
    confidence: Math.round(confidence * 100) / 100,
    raw: { from, subject, id: email.id },
  };
}

/** Human-friendly label for a source, used in the review UI. */
export function sourceLabel(source: TxnSource): string {
  switch (source) {
    case 'sbicard': return 'SBI Credit Card';
    case 'hsbc-cc': return 'HSBC Credit Card';
    case 'icici-cc': return 'ICICI Credit Card';
    case 'bobcard-cc': return 'BOB Credit Card';
    case 'au-cc': return 'AU Bank Credit Card';
    case 'sbi-savings': return 'SBI Savings A/C';
    case 'idfc-savings': return 'IDFC Bank A/C';
    default: return 'Unknown';
  }
}

/**
 * The Gmail search query that matches only the senders we care about. Kept here
 * (not in the repository) so it is unit-testable and easy to extend per bank.
 */
export function buildGmailQuery(days: number): string {
  const senders = [
    'from:sbicard.com',
    'from:bobcard.in',
    'from:aubank.in',
    'from:hsbc.co.in',
    'from:mail.hsbc.co.in',
    'from:hsbc.com',
    'from:icicibank.com',
    'from:icici.bank.in',
    'from:sbi.co.in',
    'from:alerts.sbi.co.in',
    'from:sbi.bank.in',
    'from:idfcfirstbank.com',
  ];
  // No subject filter: some genuine alerts (e.g. HSBC's "We're writing to
  // confirm...") don't put "transaction" in the subject. Promotional /
  // EMI-conversion mail is rejected by the parser (kind='promo') instead, so
  // nothing real is dropped at fetch time.
  return `(${senders.join(' OR ')}) newer_than:${Math.max(1, Math.floor(days))}d`;
}
