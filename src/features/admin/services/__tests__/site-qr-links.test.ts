import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), addDoc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(),
  getDocs: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), increment: vi.fn(),
  orderBy: vi.fn(), query: vi.fn(), serverTimestamp: vi.fn(), Timestamp: class {},
}));
vi.mock('@/lib/firebase', () => ({ db: {} }));

import { SITE_QR_LINKS, buildSiteQrLinkInput } from '../site-qr-links';
import { DEFAULT_LINK_DESTINATIONS } from '../marketing-links.service';
import { sanitizeClickSource } from '../link-routing';

describe('site QR links', () => {
  it('has exactly the three fixed ids the marketing site uses', () => {
    expect(SITE_QR_LINKS.map((d) => d.id)).toEqual(['app-ios', 'app-android', 'app-smart']);
  });

  it('per-store links send every device to their own store', () => {
    const ios = buildSiteQrLinkInput('app-ios');
    const android = buildSiteQrLinkInput('app-android');
    for (const k of ['iosUrl', 'androidUrl', 'desktopUrl', 'fallbackUrl'] as const) {
      expect(ios[k]).toBe(DEFAULT_LINK_DESTINATIONS.iosUrl);
      expect(android[k]).toBe(DEFAULT_LINK_DESTINATIONS.androidUrl);
    }
    expect(ios.useSmartLink).toBe(true);
    expect(android.useSmartLink).toBe(true);
  });

  it('the smart link leaves the slots empty so it follows the global per-device defaults', () => {
    const smart = buildSiteQrLinkInput('app-smart', 'uid1');
    expect(smart.useSmartLink).toBe(true);
    expect(smart.iosUrl).toBeNull();
    expect(smart.androidUrl).toBeNull();
    expect(smart.desktopUrl).toBeNull();
    expect(smart.createdBy).toBe('uid1');
    expect(smart.utmCampaign).toBe('site_qr_smart');
  });
});

describe('sanitizeClickSource', () => {
  it('keeps simple tags, lower-cased', () => {
    expect(sanitizeClickSource('site-qr')).toBe('site-qr');
    expect(sanitizeClickSource(' Site_QR ')).toBe('site_qr');
  });
  it('drops empty, long or odd values', () => {
    expect(sanitizeClickSource(null)).toBeNull();
    expect(sanitizeClickSource('')).toBeNull();
    expect(sanitizeClickSource('a'.repeat(41))).toBeNull();
    expect(sanitizeClickSource('<script>')).toBeNull();
    expect(sanitizeClickSource('אתר')).toBeNull();
  });
});
