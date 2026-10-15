import { describe, expect, it } from 'vitest';
import { fromKey, normalizePath, normalizeWebEvent, referrerHost, toKey } from '../web-events';
import { buildWebDailyIncrement } from '../web-stats-write';

describe('web traffic — normalisation', () => {
  it('normalises paths to a bounded key set', () => {
    expect(normalizePath('/web')).toBe('home');
    expect(normalizePath('/web/he')).toBe('he');
    expect(normalizePath('/web/he/strength?utm_source=ig')).toBe('he|strength');
    expect(normalizePath('/web/he/learn/sPASfuHeE1eAFQgHrE5z')).toBe('he|learn|:exercise');
    expect(normalizePath('/web/he/learn/articles/first-pull-up')).toBe('he|learn|articles|first-pull-up');
    expect(normalizePath('/admin')).toBeNull();
    expect(normalizePath(42)).toBeNull();
  });

  it('round-trips keys for display', () => {
    expect(fromKey(toKey('l.instagram.com'))).toBe('l.instagram.com');
    expect(fromKey('he|strength')).toBe('he/strength');
  });

  it('reduces the referrer to its host and drops our own site', () => {
    expect(referrerHost('https://l.instagram.com/?u=x')).toBe('instagram.com');
    expect(referrerHost('https://www.ynet.co.il/digital/x')).toBe('ynet.co.il');
    expect(referrerHost('https://outrun.co.il/web/he')).toBeNull();
    expect(referrerHost('not a url')).toBeNull();
  });

  it('accepts a page view; utm beats the referrer; no source = direct', () => {
    expect(normalizeWebEvent({ t: 'pv', p: '/web/he', s: 1, r: 'https://www.google.com/', us: 'Instagram' })).toMatchObject({
      type: 'pv',
      pathKey: 'he',
      newSession: true,
      source: 'instagram',
    });
    expect(normalizeWebEvent({ t: 'pv', p: '/web/he/running', r: 'https://www.google.com/' })).toMatchObject({ source: 'google·com', newSession: false });
    expect(normalizeWebEvent({ t: 'pv', p: '/web/en' })).toMatchObject({ source: 'direct', locale: 'en' });
  });

  it('only accepts known CTA targets and scroll depths', () => {
    expect(normalizeWebEvent({ t: 'cta', p: '/web/he', x: 'appstore' })).toMatchObject({ type: 'cta', target: 'appstore' });
    expect(normalizeWebEvent({ t: 'cta', p: '/web/he', x: 'hack' })).toBeNull();
    expect(normalizeWebEvent({ t: 'scroll', p: '/web/he', d: 75 })).toMatchObject({ type: 'scroll', depth: 75 });
    expect(normalizeWebEvent({ t: 'scroll', p: '/web/he', d: 60 })).toBeNull();
    expect(normalizeWebEvent({ t: 'boom', p: '/web/he' })).toBeNull();
    expect(normalizeWebEvent(null)).toBeNull();
  });
});

describe('web traffic — daily rollup increment', () => {
  const at = new Date('2026-10-15T09:30:00Z'); // 12:30 in Israel

  it('counts per-session dimensions only on the first page view', () => {
    const first = buildWebDailyIncrement(
      { type: 'pv', pathKey: 'he', locale: 'he', newSession: true, source: 'instagram', medium: 'social', campaign: null },
      { at, device: 'ios', country: 'IL' },
    );
    expect(first.docId).toBe('2026-10-15');
    expect(Object.keys(first.data)).toEqual(
      expect.arrayContaining(['pageviews', 'byPath', 'byHour', 'sessions', 'bySource', 'byMedium', 'byLanding', 'byDevice', 'byLocale', 'byCountry']),
    );
    expect(first.data).not.toHaveProperty('byCampaign');

    const next = buildWebDailyIncrement(
      { type: 'pv', pathKey: 'he|strength', locale: 'he', newSession: false, source: 'direct', medium: null, campaign: null },
      { at, device: 'ios', country: 'IL' },
    );
    expect(next.data).toHaveProperty('pageviews');
    expect(next.data).not.toHaveProperty('sessions');
    expect(next.data).not.toHaveProperty('bySource');
  });

  it('counts CTA clicks and scroll depth in their own maps', () => {
    const cta = buildWebDailyIncrement({ type: 'cta', pathKey: 'he', locale: 'he', target: 'play' }, { at, device: 'android', country: null });
    expect(Object.keys(cta.data)).toEqual(expect.arrayContaining(['ctaTotal', 'ctaByTarget', 'ctaByPath']));
    const sc = buildWebDailyIncrement({ type: 'scroll', pathKey: 'he', locale: 'he', depth: 50 }, { at, device: 'desktop', country: null });
    expect(Object.keys(sc.data)).toEqual(expect.arrayContaining(['scrollByDepth']));
    expect(sc.data).not.toHaveProperty('pageviews');
  });
});
