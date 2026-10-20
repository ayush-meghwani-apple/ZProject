export interface GmailApiFailure {
  message: string;
  reason: string;
  retryable: boolean;
}

interface GmailErrorBody {
  error?: {
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}

const RETRYABLE_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'backendError',
]);

export function isGmailRateLimit(status: number, reason: string): boolean {
  return status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded';
}

export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export function gmailApiFailure(status: number, body: unknown): GmailApiFailure {
  const parsed = body && typeof body === 'object' ? body as GmailErrorBody : {};
  const detail = parsed.error?.errors?.[0];
  const reason = detail?.reason ?? '';
  const message = parsed.error?.message ?? detail?.message ?? `Gmail API error ${status}`;
  return {
    message,
    reason,
    retryable: status === 429 || status >= 500 || RETRYABLE_REASONS.has(reason),
  };
}