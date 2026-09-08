import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const WHATSAPP_UA = 'WhatsApp/2.23.20.79 A';
const CHROME_ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36';
const CHROME_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';

/**
 * Minimal fake Firestore doc/collection chain covering exactly the calls
 * `handleLinkClick` makes: `db.collection(x).doc(id).get()`, `.update()`,
 * and (via `linkRef.firestore.batch()`) the batched click-record +
 * daily-stats writes. `updateImpl`/`batchCommitImpl` are injectable so
 * individual tests can make either one throw.
 */
function makeFakeDb(opts: {
  linkData: Record<string, unknown>;
  updateImpl?: () => Promise<unknown>;
  batchCommitImpl?: () => Promise<unknown>;
}) {
  const update = vi.fn(opts.updateImpl ?? (() => Promise.resolve()));
  const batchSet = vi.fn();
  const batchCommit = vi.fn(opts.batchCommitImpl ?? (() => Promise.resolve()));
  const batch = { set: batchSet, commit: batchCommit };

  const docRef = {
    get: vi.fn(() =>
      Promise.resolve({ exists: true, data: () => opts.linkData }),
    ),
    update,
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id?: string) => ({ id: id ?? 'fake-auto-id', __collection: name })),
    })),
    firestore: { batch: vi.fn(() => batch) },
  };

  const db = {
    collection: vi.fn(() => ({ doc: vi.fn(() => docRef) })),
  };

  return { db, update, batchSet, batchCommit };
}

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: vi.fn(),
}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

async function callHandler(
  fakeDb: ReturnType<typeof makeFakeDb>['db'],
  requestInit: { url: string; userAgent?: string; ip?: string },
) {
  const { getAdminDb } = await import('@/lib/firebase-admin');
  vi.mocked(getAdminDb).mockReturnValue(fakeDb as never);

  const { handleLinkClick } = await import('../link-click-handler');

  const headers = new Headers();
  if (requestInit.userAgent) headers.set('user-agent', requestInit.userAgent);
  if (requestInit.ip) headers.set('x-forwarded-for', requestInit.ip);

  const request = new NextRequest(requestInit.url, { headers });
  return handleLinkClick(request, 'abc123');
}

describe('handleLinkClick — resilience (best-effort logging must never block the redirect)', () => {
  it('still redirects when the per-click record + daily-stats batch write fails', async () => {
    const { db, update, batchCommit } = makeFakeDb({
      linkData: { isActive: true, useSmartLink: false, oneLinkUrl: 'https://onelink.to/nmpcb5' },
      batchCommitImpl: () => Promise.reject(new Error('simulated Firestore write failure')),
    });

    const res = await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: CHROME_DESKTOP_UA,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('onelink.to/nmpcb5');
    expect(update).toHaveBeenCalled();       // counter increment still attempted
    expect(batchCommit).toHaveBeenCalled();  // click-record + daily-stats batch was attempted (and rejected) — not blocking
  });

  it('still redirects when the counter increment itself fails', async () => {
    const { db } = makeFakeDb({
      linkData: { isActive: true, useSmartLink: false, oneLinkUrl: 'https://onelink.to/nmpcb5' },
      updateImpl: () => Promise.reject(new Error('simulated increment failure')),
    });

    const res = await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: CHROME_DESKTOP_UA,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('onelink.to/nmpcb5');
  });
});

describe('handleLinkClick — bot filtering', () => {
  it('redirects a bot/preview crawler but never counts it', async () => {
    const { db, update, batchCommit } = makeFakeDb({
      linkData: { isActive: true, useSmartLink: false, oneLinkUrl: 'https://onelink.to/nmpcb5' },
    });

    const res = await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: WHATSAPP_UA,
    });

    expect(res.status).toBe(302);
    expect(update).not.toHaveBeenCalled();
    expect(batchCommit).not.toHaveBeenCalled();
  });

  it('counts a real Android user (not a bot)', async () => {
    const { db, update } = makeFakeDb({
      linkData: { isActive: true, useSmartLink: false, oneLinkUrl: 'https://onelink.to/nmpcb5' },
    });

    await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: CHROME_ANDROID_UA,
    });

    expect(update).toHaveBeenCalled();
  });
});

describe('handleLinkClick — Smart Link (useSmartLink: true)', () => {
  it('routes an Android user straight to Play with a link_id+click_id-only referrer, skipping onelink.to', async () => {
    const { db } = makeFakeDb({
      linkData: {
        isActive: true,
        useSmartLink: true,
        androidUrl: 'https://play.google.com/store/apps/details?id=il.co.oversight.outapp',
        // Deliberately present on the link doc but must NOT ride the
        // referrer — link_id alone already identifies source/campaign in
        // our own marketing_links doc (David's Smart Link feedback,
        // trimmed 05.09.2026: utm_* in the referrer was redundant and,
        // for non-ASCII values, wasteful against Play's length limit).
        utmSource: 'facebook',
        utmCampaign: 'spring_2026',
      },
    });

    const res = await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: CHROME_ANDROID_UA,
    });

    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    const parsed = new URL(location);
    expect(parsed.origin + parsed.pathname).toBe('https://play.google.com/store/apps/details');
    expect(parsed.searchParams.get('id')).toBe('il.co.oversight.outapp');

    // Decode the referrer param back to the raw payload the app-side
    // Install Referrer API will actually receive, and assert its exact
    // shape — link_id + click_id, nothing else.
    const referrer = parsed.searchParams.get('referrer')!;
    const referrerParams = new URLSearchParams(referrer);
    expect(referrerParams.get('link_id')).toBe('abc123');
    expect(referrerParams.get('click_id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(Array.from(referrerParams.keys()).sort()).toEqual(['click_id', 'link_id']);

    expect(location).not.toContain('onelink.to');
  });

  it('routes an iOS user to the App Store, ignoring androidUrl entirely', async () => {
    const { db } = makeFakeDb({
      linkData: {
        isActive: true,
        useSmartLink: true,
        iosUrl: 'https://apps.apple.com/il/app/out/id6502558672',
        androidUrl: 'https://play.google.com/store/apps/details?id=il.co.oversight.outapp',
      },
    });

    const res = await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
    });

    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toBe('https://apps.apple.com/il/app/out/id6502558672');
  });

  it('routes a desktop user to the landing page, ignoring iosUrl/androidUrl entirely', async () => {
    const { db } = makeFakeDb({
      linkData: {
        isActive: true,
        useSmartLink: true,
        iosUrl: 'https://apps.apple.com/il/app/out/id6502558672',
        androidUrl: 'https://play.google.com/store/apps/details?id=il.co.oversight.outapp',
        desktopUrl: 'https://outrun.co.il/gan-haair',
      },
    });

    const res = await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: CHROME_DESKTOP_UA,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://outrun.co.il/gan-haair');
  });

  it('falls back to the global default when the link has no override for this device', async () => {
    const { db } = makeFakeDb({
      linkData: { isActive: true, useSmartLink: true }, // no iosUrl/androidUrl/desktopUrl at all
    });

    const res = await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
    });

    expect(res.headers.get('location')).toBe('https://apps.apple.com/il/app/out/id6502558672');
  });
});

describe('handleLinkClick — click record + daily-stats rollup are batched together', () => {
  it('writes both the click record and the daily-stats doc in one batch, capturing country/city', async () => {
    const { db, batchSet, batchCommit } = makeFakeDb({
      linkData: { isActive: true, useSmartLink: false, oneLinkUrl: 'https://onelink.to/nmpcb5' },
    });

    const headers = new Headers();
    headers.set('user-agent', CHROME_ANDROID_UA);
    headers.set('x-vercel-ip-country', 'IL');
    headers.set('x-vercel-ip-city', 'Haifa');

    const { getAdminDb } = await import('@/lib/firebase-admin');
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    const { handleLinkClick } = await import('../link-click-handler');
    await handleLinkClick(new NextRequest('https://outrun.co.il/r/abc123', { headers }), 'abc123');

    expect(batchSet).toHaveBeenCalledTimes(2);
    expect(batchCommit).toHaveBeenCalledTimes(1);

    const clickRecordCall = batchSet.mock.calls.find((c) => c[0].__collection === 'clicks');
    expect(clickRecordCall?.[1]).toMatchObject({ device: 'android', country: 'IL', city: 'Haifa' });

    const dailyStatsCall = batchSet.mock.calls.find((c) => c[0].__collection === 'daily_stats');
    expect(dailyStatsCall?.[2]).toEqual({ merge: true });
    expect(dailyStatsCall?.[1]).toMatchObject({
      byDevice: { android: expect.anything() },
      byCountry: { IL: expect.anything() },
      byCity: { Haifa: expect.anything() },
    });
  });

  it('URL-decodes the Vercel geo headers (city names can contain non-ASCII characters)', async () => {
    const { db, batchSet } = makeFakeDb({
      linkData: { isActive: true, useSmartLink: false, oneLinkUrl: 'https://onelink.to/nmpcb5' },
    });

    const headers = new Headers();
    headers.set('user-agent', CHROME_ANDROID_UA);
    headers.set('x-vercel-ip-city', encodeURIComponent('Tel Aviv-Yafo'));

    const { getAdminDb } = await import('@/lib/firebase-admin');
    vi.mocked(getAdminDb).mockReturnValue(db as never);
    const { handleLinkClick } = await import('../link-click-handler');
    await handleLinkClick(new NextRequest('https://outrun.co.il/r/abc123', { headers }), 'abc123');

    const clickRecordCall = batchSet.mock.calls.find((c) => c[0].__collection === 'clicks');
    expect(clickRecordCall?.[1]).toMatchObject({ city: 'Tel Aviv-Yafo' });
  });
});

describe('handleLinkClick — legacy links (useSmartLink absent) are untouched', () => {
  it('still redirects through oneLinkUrl+utm with link_id appended, exactly like before Smart Link existed', async () => {
    const { db } = makeFakeDb({
      linkData: {
        isActive: true,
        oneLinkUrl: 'https://onelink.to/nmpcb5',
        utmSource: 'רולאפ_כוח',
        utmMedium: 'רולאפ',
      },
    });

    const res = await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: CHROME_ANDROID_UA,
    });

    const location = res.headers.get('location')!;
    expect(location).toContain('onelink.to/nmpcb5');
    expect(location).toContain('link_id=abc123');
    expect(decodeURIComponent(location)).toContain('utm_source=רולאפ_כוח');
  });
});
