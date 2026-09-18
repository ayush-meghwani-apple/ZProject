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