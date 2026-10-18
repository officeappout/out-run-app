import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { isReviewCronCaller } from '../cron-auth.server';

const req = (auth?: string) => new Request('https://x/api', { headers: auth ? { authorization: auth } : {} });
const SECRET = 'a'.repeat(32);

describe('isReviewCronCaller', () => {
  it('accepts only the exact bearer secret', () => {
    expect(isReviewCronCaller(req(`Bearer ${SECRET}`), SECRET)).toBe(true);
    expect(isReviewCronCaller(req(`bearer ${SECRET}`), SECRET)).toBe(true);
    expect(isReviewCronCaller(req(`Bearer ${'b'.repeat(32)}`), SECRET)).toBe(false);
    expect(isReviewCronCaller(req(`Bearer ${SECRET}x`), SECRET)).toBe(false);
    expect(isReviewCronCaller(req(), SECRET)).toBe(false);
  });
  it('a missing or short secret disables the machine path', () => {
    expect(isReviewCronCaller(req('Bearer '), '')).toBe(false);
    expect(isReviewCronCaller(req('Bearer short'), 'short')).toBe(false);
    expect(isReviewCronCaller(req('Bearer x'), undefined)).toBe(false);
  });
});
