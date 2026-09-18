import { describe, expect, it } from 'vitest';
import { gmailApiFailure } from './gmailApiError';

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
});