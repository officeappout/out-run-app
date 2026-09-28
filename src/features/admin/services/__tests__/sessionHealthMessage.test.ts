import { describe, it, expect } from 'vitest';
import { messageForSessionFailure } from '../sessionHealthMessage';

// David caught (28.09.2026) that SessionHealthBanner showed ONE fixed
// message regardless of failure reason — a 429 and a network drop read
// identically. These tests lock in that the three reasons
// mintAdminSessionCookie actually records (src/lib/auth.service.ts) each
// produce a distinct message, so this can't silently regress back to one
// generic string.
describe('messageForSessionFailure', () => {
  it('shows a rate-limit-specific message for rate_limited', () => {
    expect(messageForSessionFailure('rate_limited')).toMatch(/יותר מדי ניסיונות/);
  });

  it('shows a network-specific message for network', () => {
    expect(messageForSessionFailure('network')).toMatch(/בעיית רשת/);
  });

  it('falls back to the generic message for any other/unknown reason (e.g. http_500)', () => {
    expect(messageForSessionFailure('http_500')).toMatch(/לא הצלחנו לרענן/);
  });

  it('falls back to the generic message for null', () => {
    expect(messageForSessionFailure(null)).toMatch(/לא הצלחנו לרענן/);
  });

  it('the three real reasons produce three DIFFERENT strings, not the same one three times', () => {
    const messages = new Set([
      messageForSessionFailure('rate_limited'),
      messageForSessionFailure('network'),
      messageForSessionFailure('http_500'),
    ]);
    expect(messages.size).toBe(3);
  });
});
