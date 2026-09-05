import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const WHATSAPP_UA = 'WhatsApp/2.23.20.79 A';
const CHROME_ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36';
const CHROME_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';

/**
 * Minimal fake Firestore doc/collection chain covering exactly the calls
 * `handleLinkClick` makes: `db.collection(x).doc(id).get()`, `.update()`,
 * and `.doc(id).collection('clicks').add()`. `updateImpl`/`addImpl` are
 * injectable so individual tests can make either one throw.
 */
function makeFakeDb(opts: {
  linkData: Record<string, unknown>;
  updateImpl?: () => Promise<unknown>;
  addImpl?: () => Promise<unknown>;
}) {
  const update = vi.fn(opts.updateImpl ?? (() => Promise.resolve()));
  const add = vi.fn(opts.addImpl ?? (() => Promise.resolve({ id: 'fake-click-doc' })));

  const docRef = {
    get: vi.fn(() =>
      Promise.resolve({ exists: true, data: () => opts.linkData }),
    ),
    update,
    collection: vi.fn(() => ({ add })),
  };

  const db = {
    collection: vi.fn(() => ({ doc: vi.fn(() => docRef) })),
  };

  return { db, update, add };
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
  it('still redirects when the per-click record write fails', async () => {
    const { db, update, add } = makeFakeDb({
      linkData: { isActive: true, useSmartLink: false, oneLinkUrl: 'https://onelink.to/nmpcb5' },
      addImpl: () => Promise.reject(new Error('simulated Firestore write failure')),
    });

    const res = await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: CHROME_DESKTOP_UA,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('onelink.to/nmpcb5');
    expect(update).toHaveBeenCalled(); // counter increment still attempted
    expect(add).toHaveBeenCalled();    // click-record write was attempted (and rejected) — not blocking
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
    const { db, update, add } = makeFakeDb({
      linkData: { isActive: true, useSmartLink: false, oneLinkUrl: 'https://onelink.to/nmpcb5' },
    });

    const res = await callHandler(db, {
      url: 'https://outrun.co.il/r/abc123',
      userAgent: WHATSAPP_UA,
    });

    expect(res.status).toBe(302);
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
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
  it('routes an Android user straight to Play with a well-formed referrer, skipping onelink.to', async () => {
    const { db } = makeFakeDb({
      linkData: {
        isActive: true,
        useSmartLink: true,
        androidUrl: 'https://play.google.com/store/apps/details?id=il.co.oversight.outapp',
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
    expect(location).toContain('play.google.com/store/apps/details?id=il.co.oversight.outapp');
    expect(location).toContain('referrer=link_id%3Dabc123%26click_id%3D');
    expect(location).toContain('utm_source%3Dfacebook');
    expect(location).toContain('utm_campaign%3Dspring_2026');
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
