import { describe, it, expect } from 'vitest';
import { isAppCheckDebugAllowed } from '../appCheckDebugGate';

/**
 * SPEC-02 SEC-10: the App Check debug paths in firebase.ts used to
 * activate purely off NEXT_PUBLIC_APP_CHECK_DEBUG_TOKEN /
 * NEXT_PUBLIC_APP_CHECK_DEBUG, with no environment check — if either var
 * leaked into Vercel Production, the whole production app would run App
 * Check in debug mode. This proves the fix: debug mode is refused
 * whenever NODE_ENV is 'production', regardless of what the debug env
 * vars say.
 */
describe('isAppCheckDebugAllowed', () => {
  it('SEC-10 fix: refuses debug mode in a production build', () => {
    expect(isAppCheckDebugAllowed('production')).toBe(false);
  });

  it('allows debug mode in development', () => {
    expect(isAppCheckDebugAllowed('development')).toBe(true);
  });

  it('allows debug mode in test', () => {
    expect(isAppCheckDebugAllowed('test')).toBe(true);
  });

  it('allows debug mode when NODE_ENV is unset', () => {
    expect(isAppCheckDebugAllowed(undefined)).toBe(true);
  });
});
