import { describe, expect, it } from 'vitest';
import { gmailApiFailure, isGmailRateLimit, retryAfterMs } from './gmailApiError';

describe('gmailApiFailure', () => {
  it('marks a Gmail user rate limit as retryable and preserves its message', () => {
    expect(gmailApiFailure(403, {
      error: {
        message: 'User Rate Limit Exceeded',
        errors: [{ reason: 'userRateLimitExceeded' }],
      },
    })).toEqual({
      message: 'User Rate Limit Exceeded',
      reason: 'userRateLimitExceeded',
      retryable: true,
    });
  });

  it('does not retry a permission failure', () => {
    expect(gmailApiFailure(403, {
      error: {
        message: 'Insufficient Permission',
        errors: [{ reason: 'insufficientPermissions' }],
      },
    })).toEqual({
      message: 'Insufficient Permission',
      reason: 'insufficientPermissions',
      retryable: false,
    });
  });

  it('retries server and too-many-request responses without a JSON body', () => {
    expect(gmailApiFailure(429, null).retryable).toBe(true);
    expect(gmailApiFailure(503, null).retryable).toBe(true);
  });

  it('identifies both Gmail quota reasons and HTTP 429 as rate limits', () => {
    expect(isGmailRateLimit(403, 'userRateLimitExceeded')).toBe(true);
    expect(isGmailRateLimit(403, 'rateLimitExceeded')).toBe(true);
    expect(isGmailRateLimit(429, '')).toBe(true);
    expect(isGmailRateLimit(503, 'backendError')).toBe(false);
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    const now = Date.parse('2026-10-20T19:30:00Z');
    expect(retryAfterMs('45', now)).toBe(45_000);
    expect(retryAfterMs('Tue, 20 Oct 2026 19:31:00 GMT', now)).toBe(60_000);
    expect(retryAfterMs('invalid', now)).toBe(0);
  });
});