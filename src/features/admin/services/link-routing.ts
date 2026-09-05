/**
 * Link Routing — pure device/bot/referrer logic for the Smart Link redirect.
 *
 * Kept free of Next.js/Firestore imports on purpose: `/api/links/[id]/click`
 * and `/r/[id]` both need this exact logic, and pure functions are trivial
 * to unit test without mocking a request/response cycle.
 */

// ─── Device detection ──────────────────────────────────────────────────────

export type DeviceBucket = 'ios' | 'android' | 'desktop';

/**
 * iOS/iPadOS/Android/Desktop from User-Agent alone.
 *
 * Known limitation (not fixable server-side): iPadOS has requested the
 * "desktop" version of Safari by default since iPadOS 13, so a modern
 * iPad's User-Agent is indistinguishable from a real Mac's — it will be
 * classified as `desktop` here. Detecting real iPads reliably needs a
 * client-side signal (e.g. `navigator.maxTouchPoints`), which a server
 * redirect never sees. The literal `iPad` token below still catches
 * older iPadOS/other-browser cases where it's present.
 */
export function detectDeviceBucket(userAgent: string | null | undefined): DeviceBucket {
  if (!userAgent) return 'desktop';
  const ua = userAgent.toLowerCase();
  if (/ipad|iphone|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

// ─── Destination resolution ─────────────────────────────────────────────────

export interface LinkDestinations {
  iosUrl: string | null;
  androidUrl: string | null;
  desktopUrl: string | null;
  fallbackUrl: string | null;
}

/**
 * Per-link value wins; falls back to the global default; falls back again
 * to `fallbackUrl` (link-level then global) if the device-specific slot is
 * empty on both. Never throws — returns null only if literally nothing is
 * configured anywhere, which the caller must treat as a hard error (there
 * is no sensible redirect target).
 */
export function resolveDestinationUrl(
  bucket: DeviceBucket,
  linkOverrides: Partial<LinkDestinations>,
  globalDefaults: LinkDestinations,
): string | null {
  const pick = (key: keyof LinkDestinations): string | null =>
    linkOverrides[key] ?? globalDefaults[key] ?? null;

  const primaryKey: keyof LinkDestinations =
    bucket === 'ios' ? 'iosUrl' : bucket === 'android' ? 'androidUrl' : 'desktopUrl';

  return pick(primaryKey) ?? pick('fallbackUrl');
}

// ─── Android install referrer ───────────────────────────────────────────────

/**
 * Play Install Referrer has a real length limit on the decoded referrer
 * string (what the app receives via `ReferrerDetails.getInstallReferrer()`
 * — i.e. the RAW value below, before `appendAndroidReferrer`'s extra
 * encoding pass for embedding it in our redirect URL). Checked against
 * the raw value on purpose — that's the actual payload Google's API
 * constrains, not an artifact of how we happen to transport it.
 */
export const MAX_ANDROID_REFERRER_LENGTH = 500;

/**
 * Builds the RAW (single-encoded-per-field, not yet embedded in a URL)
 * referrer payload Google Play forwards to the app on first open via the
 * Play Install Referrer API. Deliberately returns the unencoded structure
 * (`key=value&key=value`, individual values already `encodeURIComponent`'d)
 * — `appendAndroidReferrer` below is responsible for embedding it as a
 * single query-string value, which applies the SECOND encoding pass
 * (turning the literal `&`/`=` here into `%26`/`%3D`). This two-pass
 * double-encoding is the standard, expected shape for a referrer string
 * nested inside another URL's query string — do not pre-encode further
 * here, or the value doubly-escapes on the way out.
 *
 * Deliberately `link_id` + `click_id` ONLY — no utm_source/utm_campaign.
 * `link_id` alone already identifies source/campaign/medium/location in
 * our own `marketing_links` doc; re-sending them through Google adds
 * nothing and, for non-ASCII values (e.g. a Hebrew utm_source), each
 * character costs ~12 encoded chars against the length limit above for
 * no benefit.
 */
export function buildAndroidReferrerRaw(params: {
  linkId: string;
  clickId: string;
}): string {
  const raw = [
    `link_id=${encodeURIComponent(params.linkId)}`,
    `click_id=${encodeURIComponent(params.clickId)}`,
  ].join('&');

  if (raw.length > MAX_ANDROID_REFERRER_LENGTH) {
    console.error(
      `[link-routing] Android referrer string exceeds ${MAX_ANDROID_REFERRER_LENGTH} chars ` +
      `(${raw.length}) for link_id=${params.linkId} — Google Play may truncate or reject it.`,
    );
  }

  return raw;
}

/**
 * Appends `?referrer=<referrerRaw>` (or `&referrer=...` if the URL already
 * has a query string) onto a Play Store URL. Uses `URL.searchParams.set`
 * so the raw payload gets exactly one more encoding pass — see
 * `buildAndroidReferrerRaw`'s doc comment for why that's correct here.
 */
export function appendAndroidReferrer(androidUrl: string, referrerRaw: string): string {
  try {
    const url = new URL(androidUrl);
    url.searchParams.set('referrer', referrerRaw);
    return url.toString();
  } catch {
    // Non-absolute URL — best-effort, leave as-is rather than throw.
    return androidUrl;
  }
}
