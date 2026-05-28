/**
 * Marketing Attribution — Growth Hub Phase 3
 *
 * Captures inbound traffic parameters (UTM tags, Google/Meta/TikTok click
 * IDs) at the first onboarding-page hit and persists them through the
 * session until onboarding completes. At completion the sync service
 * flushes the captured payload onto the user document as a top-level
 * `marketingAttribution` object so growth analytics can isolate users
 * by acquisition campaign and compute CAC.
 *
 * Lifecycle:
 *   1. Entry page mount → `captureMarketingAttribution(searchParams)`
 *      reads the URL query, picks the six tracked keys, and writes the
 *      normalized object to `sessionStorage` under `out_marketing_attribution`.
 *      Idempotent: a non-organic capture already in storage is NEVER
 *      overwritten by a later same-session navigation, so the original
 *      click signal wins.
 *
 *   2. Onboarding completes → `buildAttributionPayload()` returns the
 *      Firestore-ready object (with `serverTimestamp()` for `capturedAt`).
 *      A null sessionStorage state falls back to `source: 'organic'` and
 *      all other fields null — so direct/typed-URL users still get a
 *      well-formed attribution document instead of a missing field.
 *
 * The module is browser-only at the storage layer. SSR call sites (e.g.
 * the sync service running during a Next.js dev request) get the
 * organic fallback silently — no exceptions thrown.
 */

import { serverTimestamp, type FieldValue } from 'firebase/firestore';

/** sessionStorage key — namespaced to avoid collision with other app state. */
const STORAGE_KEY = 'out_marketing_attribution';

/**
 * Raw payload cached in sessionStorage. All fields are nullable so the
 * organic / direct-traffic case round-trips cleanly through JSON.
 */
export interface MarketingAttributionPayload {
  /** utm_source — e.g. 'facebook', 'google', 'instagram', 'qr_print' */
  source: string | null;
  /** utm_medium — e.g. 'cpc', 'social', 'qr', 'email' */
  medium: string | null;
  /** utm_campaign — campaign slug from the ad platform */
  campaign: string | null;
  /**
   * Unified ad-click identifier. Holds the first non-null of
   * gclid (Google), fbclid (Meta) or ttclid (TikTok). The original
   * source platform is implicit from `source`.
   */
  adId: string | null;
}

/**
 * Firestore document shape — extends the raw payload with the server
 * timestamp recorded at write time and a manual-fill CAC slot for ops.
 */
export interface MarketingAttributionDoc extends MarketingAttributionPayload {
  /**
   * Server-set timestamp when the user document was finalised. We use
   * the write-time timestamp (not the click time) because client clocks
   * are unreliable and we only need ordering, not absolute capture latency.
   */
  capturedAt: FieldValue;
  /**
   * Estimated Customer Acquisition Cost in the campaign's currency.
   * Left null at write time — backfilled by ops tooling that joins
   * ad-platform spend reports against campaign IDs.
   */
  estimatedCAC: number | null;
}

/**
 * Source-of-truth for the URL keys we care about. Adding a new key here
 * is the only edit needed to track a new ad platform.
 */
const TRACKED_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'gclid',
  'fbclid',
  'ttclid',
] as const;

/**
 * Minimal interface that `ReadonlyURLSearchParams` and the native
 * `URLSearchParams` both satisfy — lets the capture function accept
 * either without an explicit dependency on next/navigation types.
 */
export interface SearchParamsLike {
  get(name: string): string | null;
}

/** Trim + nullify empty strings so we never persist a literal `""`. */
function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Inspect a URLSearchParams-like object and write the normalized
 * attribution payload to sessionStorage. Safe to call repeatedly on
 * every entry-page mount — the first non-organic capture wins.
 *
 * Returns the payload that ended up in storage (or `null` if running
 * outside the browser).
 */
export function captureMarketingAttribution(
  searchParams: SearchParamsLike | null | undefined,
): MarketingAttributionPayload | null {
  if (typeof window === 'undefined') return null;
  if (!searchParams) return null;

  const incoming = {
    utm_source:   clean(searchParams.get('utm_source')),
    utm_medium:   clean(searchParams.get('utm_medium')),
    utm_campaign: clean(searchParams.get('utm_campaign')),
    gclid:        clean(searchParams.get('gclid')),
    fbclid:       clean(searchParams.get('fbclid')),
    ttclid:       clean(searchParams.get('ttclid')),
  };

  // If none of the tracked keys were present we treat this as a
  // session-organic visit but still seed sessionStorage with nulls so
  // that the read path below can distinguish "we already inspected the
  // URL this session" from "we never looked".
  const hasAnySignal = TRACKED_KEYS.some((k) => incoming[k] != null);

  let existing: MarketingAttributionPayload | null = null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) existing = JSON.parse(raw) as MarketingAttributionPayload;
  } catch {
    // Corrupt sessionStorage value — discard and overwrite below.
    existing = null;
  }

  // Idempotency rule: a prior non-organic capture (existing.source != null)
  // is treated as canonical and never overwritten by a later navigation
  // in the same tab. This preserves the original ad-click attribution
  // even if the user opens a deep-link with no UTM params.
  if (existing && existing.source != null) return existing;

  // If the new URL also carries no signals AND we already have a (null)
  // organic record, leave the existing record alone.
  if (!hasAnySignal && existing) return existing;

  const payload: MarketingAttributionPayload = {
    source:   incoming.utm_source,
    medium:   incoming.utm_medium,
    campaign: incoming.utm_campaign,
    // Pick whichever click-id is present — Google → Meta → TikTok.
    adId: incoming.gclid ?? incoming.fbclid ?? incoming.ttclid ?? null,
  };

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode / disabled storage — fail silently. The completion
    // gate will fall back to the organic default.
  }

  return payload;
}

/**
 * Read the cached attribution payload from sessionStorage.
 * Returns `null` when running outside the browser or when storage is
 * empty / unreadable.
 */
export function readMarketingAttribution(): MarketingAttributionPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MarketingAttributionPayload;
  } catch {
    return null;
  }
}

/**
 * Build the Firestore-ready `marketingAttribution` document. Called by
 * the onboarding-sync service at the COMPLETED write gate.
 *
 * Behaviour for the missing-storage case (SSR, private mode, direct
 * /typed entry that never hit a capture page):
 *   • source       → 'organic'   (so analytics queries don't break on null)
 *   • medium       → null
 *   • campaign     → null
 *   • adId         → null
 *   • capturedAt   → serverTimestamp()
 *   • estimatedCAC → null
 */
export function buildAttributionPayload(): MarketingAttributionDoc {
  const cached = readMarketingAttribution();
  return {
    source:       cached?.source   ?? 'organic',
    medium:       cached?.medium   ?? null,
    campaign:     cached?.campaign ?? null,
    adId:         cached?.adId     ?? null,
    capturedAt:   serverTimestamp(),
    estimatedCAC: null,
  };
}
