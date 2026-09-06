import { describe, expect, it, vi } from 'vitest';
import {
  appendAndroidReferrer,
  buildAndroidReferrerRaw,
  detectDeviceBucket,
  MAX_ANDROID_REFERRER_LENGTH,
  resolveDestinationUrl,
  type LinkDestinations,
} from '../link-routing';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';

describe('detectDeviceBucket', () => {
  it('classifies iPhone as ios', () => {
    expect(detectDeviceBucket(IPHONE_UA)).toBe('ios');
  });
  it('classifies Android UA as android', () => {
    expect(detectDeviceBucket(ANDROID_UA)).toBe('android');
  });
  it('classifies desktop Mac as desktop', () => {
    expect(detectDeviceBucket(DESKTOP_UA)).toBe('desktop');
  });
  it('falls back to desktop when User-Agent is missing', () => {
    expect(detectDeviceBucket(null)).toBe('desktop');
    expect(detectDeviceBucket(undefined)).toBe('desktop');
  });
});

describe('resolveDestinationUrl', () => {
  const defaults: LinkDestinations = {
    iosUrl: 'https://apps.apple.com/il/app/out/id6502558672',
    androidUrl: 'https://play.google.com/store/apps/details?id=il.co.oversight.outapp',
    desktopUrl: 'https://outrun.co.il',
    fallbackUrl: 'https://outrun.co.il',
  };

  it('uses the global default when the link has no override', () => {
    expect(resolveDestinationUrl('ios', {}, defaults)).toBe(defaults.iosUrl);
    expect(resolveDestinationUrl('android', {}, defaults)).toBe(defaults.androidUrl);
    expect(resolveDestinationUrl('desktop', {}, defaults)).toBe(defaults.desktopUrl);
  });

  it('link-level override wins over the global default', () => {
    const override = { androidUrl: 'https://outrun.co.il/gan-haair' };
    expect(resolveDestinationUrl('android', override, defaults)).toBe(override.androidUrl);
    // Unrelated buckets on the same link still fall through to the default.
    expect(resolveDestinationUrl('ios', override, defaults)).toBe(defaults.iosUrl);
  });

  it('falls back to fallbackUrl when the bucket-specific slot is empty on both link and default', () => {
    const emptyDefaults: LinkDestinations = { ...defaults, desktopUrl: null };
    expect(resolveDestinationUrl('desktop', {}, emptyDefaults)).toBe(emptyDefaults.fallbackUrl);
  });

  it('returns null when nothing is configured anywhere', () => {
    const nothing: LinkDestinations = { iosUrl: null, androidUrl: null, desktopUrl: null, fallbackUrl: null };
    expect(resolveDestinationUrl('ios', {}, nothing)).toBeNull();
  });
});

describe('buildAndroidReferrerRaw + appendAndroidReferrer', () => {
  it('builds link_id + click_id ONLY — no utm_source/utm_campaign', () => {
    const raw = buildAndroidReferrerRaw({ linkId: 'abc123', clickId: 'uuid-1' });
    expect(raw).toBe('link_id=abc123&click_id=uuid-1');

    const finalUrl = appendAndroidReferrer(
      'https://play.google.com/store/apps/details?id=il.co.oversight.outapp',
      raw,
    );
    const parsed = new URL(finalUrl);
    // The referrer param round-trips back to the exact raw string once decoded —
    // this is what the app-side Install Referrer API will receive.
    expect(parsed.searchParams.get('referrer')).toBe(raw);
    // And the serialized URL carries the double-encoded form Google Play expects
    // (inner `&`/`=` show up as %26/%3D in the literal query string).
    expect(finalUrl).toBe(
      'https://play.google.com/store/apps/details?id=il.co.oversight.outapp&referrer=link_id%3Dabc123%26click_id%3Duuid-1',
    );
  });

  it('encodeURIComponent-escapes a linkId/clickId that itself contains & or =', () => {
    const raw = buildAndroidReferrerRaw({ linkId: 'a&b=c', clickId: 'uuid-1' });
    expect(raw).toBe('link_id=a%26b%3Dc&click_id=uuid-1');
  });

  it('falls back to the raw androidUrl (no throw) when given a non-absolute URL', () => {
    expect(appendAndroidReferrer('not-a-url', 'link_id=x')).toBe('not-a-url');
  });

  it('logs clearly (but still returns the string) when the raw referrer exceeds the length limit', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hugeLinkId = 'x'.repeat(MAX_ANDROID_REFERRER_LENGTH + 50);

    const raw = buildAndroidReferrerRaw({ linkId: hugeLinkId, clickId: 'uuid-1' });

    expect(raw.length).toBeGreaterThan(MAX_ANDROID_REFERRER_LENGTH);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('exceeds');
    errorSpy.mockRestore();
  });

  it('does not log when the raw referrer is within the length limit', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    buildAndroidReferrerRaw({ linkId: 'abc123', clickId: 'uuid-1' });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
