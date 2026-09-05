import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAttributionPayload,
  captureMarketingAttribution,
} from '../marketingAttribution';

/**
 * Stubs a plain-web `window`/`document` (no `Capacitor`) backed by a fake
 * localStorage — exercises the same durable-storage path
 * `captureMarketingAttribution` uses in production, without needing a
 * real browser or a `@capacitor/preferences` mock.
 */
function stubBrowserGlobals(opts: { pathname?: string; search?: string } = {}) {
  const store = new Map<string, string>();
  const fakeLocalStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  vi.stubGlobal('window', {
    localStorage: fakeLocalStorage,
    location: { pathname: opts.pathname ?? '/gateway', search: opts.search ?? '' },
  });
  vi.stubGlobal('document', { referrer: '' });
}

function fakeSearchParams(params: Record<string, string>) {
  return { get: (key: string) => (key in params ? params[key] : null) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('captureMarketingAttribution + buildAttributionPayload', () => {
  it('a real utm/link_id signal survives to the Firestore-ready payload', async () => {
    stubBrowserGlobals();

    captureMarketingAttribution(fakeSearchParams({
      utm_source: 'facebook',
      utm_medium: 'social',
      utm_campaign: 'spring_2026',
      link_id: 'rollup_koach',
    }));

    const doc = await buildAttributionPayload();
    expect(doc.source).toBe('facebook');
    expect(doc.medium).toBe('social');
    expect(doc.campaign).toBe('spring_2026');
    expect(doc.linkId).toBe('rollup_koach');
    expect(doc.landingPage).toBe('/gateway');
    expect(doc.firstSeenAt).toEqual(expect.any(Number));
  });

  it('a link_id-only signal (no utm_* filled in) is still non-organic', async () => {
    stubBrowserGlobals();

    captureMarketingAttribution(fakeSearchParams({ link_id: 'rollup_koach' }));

    const doc = await buildAttributionPayload();
    expect(doc.linkId).toBe('rollup_koach');
    // No utm_source was present, but a real signal (linkId) was — source
    // must NOT collapse to 'organic', or getMarketingAttributedCount()'s
    // `source != 'organic'` filter would silently miss QR-only links.
    expect(doc.source).toBe('link');
    expect(doc.source).not.toBe('organic');
  });

  it('first-touch wins — a second, different capture does not override the first', async () => {
    stubBrowserGlobals();

    captureMarketingAttribution(fakeSearchParams({ utm_source: 'facebook' }));
    captureMarketingAttribution(fakeSearchParams({ utm_source: 'google' }));

    const doc = await buildAttributionPayload();
    expect(doc.source).toBe('facebook');
  });

  it('an organic seed (no signal on first visit) does not block a later real signal', async () => {
    stubBrowserGlobals();

    captureMarketingAttribution(fakeSearchParams({}));
    captureMarketingAttribution(fakeSearchParams({ utm_source: 'instagram' }));

    const doc = await buildAttributionPayload();
    expect(doc.source).toBe('instagram');
  });

  it('falls back to organic when nothing was ever captured on this device', async () => {
    stubBrowserGlobals();

    const doc = await buildAttributionPayload();
    expect(doc.source).toBe('organic');
    expect(doc.campaign).toBeNull();
    expect(doc.linkId).toBeNull();
  });
});
