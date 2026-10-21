import { describe, expect, it } from 'vitest';
import { isInterruptedNavigation, isSigninPath, needsStartNavigation } from '../lib/driver';

describe('isInterruptedNavigation', () => {
  it('treats a client-side redirect as fine', () => {
    expect(isInterruptedNavigation(new Error('page.goto: Navigation to "https://outrun.co.il/" is interrupted by another navigation to "https://outrun.co.il/gateway"'))).toBe(true);
  });
  it('keeps real failures as failures', () => {
    expect(isInterruptedNavigation(new Error('net::ERR_NAME_NOT_RESOLVED'))).toBe(false);
    expect(isInterruptedNavigation('Timeout 45000ms exceeded')).toBe(false);
  });
});

describe('needsStartNavigation (no reload over the app\'s own post-sign-in redirect)', () => {
  const B = 'https://outrun.co.il';
  it('after sign-in, start "/" is where the app already went — no reload', () => {
    expect(needsStartNavigation(`${B}/gateway`, '/', true)).toBe(false);
    expect(needsStartNavigation(`${B}/home`, '/', true)).toBe(false);
  });
  it('still on /qa/signin, or somewhere else than a specific start → navigate', () => {
    expect(needsStartNavigation(`${B}/qa/signin`, '/', true)).toBe(true);
    expect(needsStartNavigation(`${B}/home`, '/progress', true)).toBe(true);
    expect(needsStartNavigation(`${B}/home`, '/home?tab=today', true)).toBe(true);
  });
  it('already on the start page → no reload', () => {
    expect(needsStartNavigation(`${B}/home`, '/home', true)).toBe(false);
    expect(needsStartNavigation(`${B}/home/`, '/home', false)).toBe(false);
  });
  it('a guard bounce back to "/" (not after sign-in) does navigate', () => {
    expect(needsStartNavigation(`${B}/home`, '/', false)).toBe(true);
  });
  it('isSigninPath', () => {
    expect(isSigninPath(`${B}/qa/signin`)).toBe(true);
    expect(isSigninPath(`${B}/qa/signin/`)).toBe(true);
    expect(isSigninPath(`${B}/gateway`)).toBe(false);
  });
});
