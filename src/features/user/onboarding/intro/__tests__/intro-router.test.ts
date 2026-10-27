import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ auth: {}, db: {} }));

const prefs = new Map<string, string>();
vi.mock('@/lib/onboardingPrefs', () => ({
  getOnboardingPrefAsync: vi.fn(async (k: string) => prefs.get(k) ?? null),
}));

const flowPushes: string[] = [];
vi.mock('../../services/run-explore-map-flow', () => ({
  // Mirrors the real flow's last step: a plain `/explorer` push, or an invite target.
  runExploreMapFlow: vi.fn(async (router: { push: (h: string) => void }) => {
    router.push(flowPushes.shift() ?? '/explorer');
    return true;
  }),
}));

import { introAwareRouter } from '../intro-router';
import { runNewAccountFlow } from '../../services/run-new-account-flow';
import { INTRO_SEEN_PREF } from '../intro-route';

function fakeRouter() {
  const pushed: string[] = [];
  return { pushed, push: (h: string) => { pushed.push(h); } };
}

beforeEach(() => {
  prefs.clear();
  flowPushes.length = 0;
});

describe('introAwareRouter (every new sign-up sees the intro once per device)', () => {
  it('new account, intro not seen: /explorer becomes /intro', async () => {
    const r = fakeRouter();
    (await introAwareRouter(r, { introOn: true })).push('/explorer');
    expect(r.pushed).toEqual(['/intro']);
  });

  it('intro already seen on this device: /explorer unchanged', async () => {
    prefs.set(INTRO_SEEN_PREF, '1');
    const r = fakeRouter();
    (await introAwareRouter(r, { introOn: true })).push('/explorer');
    expect(r.pushed).toEqual(['/explorer']);
  });

  it('flag off: the router is returned untouched', async () => {
    const r = fakeRouter();
    expect(await introAwareRouter(r, { introOn: false })).toBe(r);
  });

  it('invite redirects and other targets pass through', async () => {
    const r = fakeRouter();
    const wrapped = await introAwareRouter(r, { introOn: true });
    wrapped.push('/arena/group/g1');
    wrapped.push('/onboarding-new/profile?context=express');
    wrapped.push('/home');
    expect(r.pushed).toEqual(['/arena/group/g1', '/onboarding-new/profile?context=express', '/home']);
  });

  it('owner preview: always the preview intro, regardless of seen', async () => {
    prefs.set(INTRO_SEEN_PREF, '1');
    const r = fakeRouter();
    (await introAwareRouter(r, { introOn: false, preview: true })).push('/explorer');
    expect(r.pushed).toEqual(['/intro?preview=1']);
  });
});

describe('runNewAccountFlow (Google / Apple new account)', () => {
  it('lands on /intro when the intro was not seen', async () => {
    const r = fakeRouter();
    await runNewAccountFlow(r, { introOn: true });
    expect(r.pushed).toEqual(['/intro']);
  });

  it('keeps a pending invite target', async () => {
    flowPushes.push('/session/abc');
    const r = fakeRouter();
    await runNewAccountFlow(r, { introOn: true });
    expect(r.pushed).toEqual(['/session/abc']);
  });

  it('lands on /explorer when the intro was seen', async () => {
    prefs.set(INTRO_SEEN_PREF, '1');
    const r = fakeRouter();
    await runNewAccountFlow(r, { introOn: true });
    expect(r.pushed).toEqual(['/explorer']);
  });
});
