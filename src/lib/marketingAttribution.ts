/**
 * Marketing Attribution — Growth Hub
 *
 * Captures inbound traffic parameters (UTM tags, our own `link_id` from
 * `/api/links/[id]/click`, and Google/Meta/TikTok click IDs) at the first
 * entry-page mount and persists them until onboarding completes. At
 * completion the sync service flushes the captured payload onto the user
 * document as a top-level `marketingAttribution` object so growth analytics
 * can isolate users by acquisition source/campaign/link and compute CAC.
 *
 * Storage tier: `src/lib/onboardingPrefs.ts` (localStorage +, on native,
 * @capacitor/preferences). Plain sessionStorage is NOT used here — a
 * marketing click and the onboarding completion that attributes it can be
 * separated by a hard app close on iOS, where WKWebView may evict both
 * sessionStorage AND localStorage between launches (see onboardingPrefs.ts
 * doc comment). Routing through the same durable helper the onboarding flow
 * already relies on for exactly this failure mode keeps attribution data
 * from silently disappearing on native.
 *
 * Policy: first-touch wins, no expiry. The first non-organic capture on a
 * device is permanent — a later organic visit (typed URL, app icon tap)
 * never overwrites it. This is a deliberate product choice, not an
 * oversight: a user who clicked a campaign link, closed the tab, and came
 * back a week later to finish signing up should still be attributed to
 * that click.
 *
 * Lifecycle:
 *   1. Entry page mount → `captureMarketingAttribution(searchParams)` reads
 *      the URL query, picks the tracked keys, and durably persists the
 *      normalized object. Idempotent — see policy above.
 *   2. Onboarding completes → `buildAttributionPayload()` returns the
 *      Firestore-ready object (with `serverTimestamp()` for `capturedAt`).
 *      A missing/expired storage state falls back to `source: 'organic'`
 *      and all other fields null — so direct/typed-URL users still get a
 *      well-formed attribution document instead of a missing field.
 */

import { serverTimestamp, type FieldValue } from 'firebase/firestore';
import { getOnboardingPref, getOnboardingPrefAsync, setOnboardingPref } from '@/lib/onboardingPrefs';

/** Storage key — namespaced to avoid collision with other onboarding prefs. */
const STORAGE_KEY = 'out_marketing_attribution';

/**
 * Raw payload cached in durable storage. All fields are nullable so the
 * organic / direct-traffic case round-trips cleanly through JSON.
 */
export interface MarketingAttributionPayload {
  /** utm_source — e.g. 'facebook', 'google', 'instagram', 'qr_physical' */
  source: string | null;
  /** utm_medium — e.g. 'cpc', 'social', 'qr', 'email' */
  medium: string | null;
  /** utm_campaign — campaign slug from the ad platform or /admin/links entry */
  campaign: string | null;
  /** utm_content — ad/creative variant, e.g. for A/B testing a rollup design */
  content: string | null;
  /** utm_term — paid-search keyword, rarely used outside Google Ads */
  term: string | null;
  /**
   * Our own `marketing_links/{id}` doc id, present only when the visit
   * arrived via `/api/links/[id]/click` (see that route's redirect target).
   * This is what lets `/admin/analytics` filter a funnel down to one
   * specific physical QR code, independent of whether utm_* was filled in.
   */
  linkId: string | null;
  /** First-touch landing path + query string, e.g. '/gateway?utm_source=...' */
  landingPage: string | null;
  /** `document.referrer` at first touch — empty string is normalized to null */
  referrer: string | null;
  /**
   * Unified ad-click identifier. Holds the first non-null of
   * gclid (Google), fbclid (Meta) or ttclid (TikTok). The original
   * source platform is implicit from `source`.
   */
  adId: string | null;
  /** Client epoch-ms at first capture. Distinct from `capturedAt` below,
   * which is the server write-time at onboarding completion — this is the
   * actual moment the click/landing happened. */
  firstSeenAt: number | null;
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
 * is the only edit needed to track a new ad platform or link parameter.
 */
const TRACKED_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'link_id',
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
 * Inspect a URLSearchParams-like object and durably persist the normalized
 * attribution payload (see storage-tier note above). Safe to call
 * repeatedly on every entry-page mount — the first non-organic capture
 * wins (see module-level policy comment).
 *
 * Returns the payload that ended up in storage (or `null` if running
 * outside the browser).
 */
export function captureMarketingAttribution(
  searchParams: SearchParamsLike | null | undefined,
): MarketingAttributionPayload | null {
  if (typeof window === 'undefined') return null;
  if (!searchParams) return null;

  const incoming: Record<(typeof TRACKED_KEYS)[number], string | null> = {
    utm_source:   clean(searchParams.get('utm_source')),
    utm_medium:   clean(searchParams.get('utm_medium')),
    utm_campaign: clean(searchParams.get('utm_campaign')),
    utm_content:  clean(searchParams.get('utm_content')),
    utm_term:     clean(searchParams.get('utm_term')),
    link_id:      clean(searchParams.get('link_id')),
    gclid:        clean(searchParams.get('gclid')),
    fbclid:       clean(searchParams.get('fbclid')),
    ttclid:       clean(searchParams.get('ttclid')),
  };

  // If none of the tracked keys were present we treat this as a
  // possibly-organic visit but still seed storage with nulls so that the
  // check below can distinguish "we already inspected a URL on this
  // device" from "we never looked" — without this seed, a later organic
  // visit's absence-of-signal would look identical to a never-captured
  // device and we'd keep re-checking indefinitely (harmless, but the seed
  // also lets us record landingPage/referrer for organic-entry users).
  const hasAnySignal = TRACKED_KEYS.some((k) => incoming[k] != null);

  const existing = readMarketingAttribution();

  // Idempotency rule: a prior non-organic capture (existing.source != null)
  // is canonical and is never overwritten by a later navigation or visit —
  // this preserves the original click attribution even across a hard close
  // (see storage-tier note) or a much later organic return visit.
  if (existing && existing.source != null) return existing;

  // If the new URL also carries no signals AND we already have a (null)
  // organic record, leave the existing record alone.
  if (!hasAnySignal && existing) return existing;

  // `buildAttributionPayload()` falls back to the literal 'organic' ONLY
  // when nothing was ever captured (no stored payload at all) — so a real
  // signal must never leave `source` null, or it would be indistinguishable
  // from "no capture happened". A physical QR link commonly has no
  // utm_source filled in (just friendlyName + physicalLocation) — default
  // to 'link' so `linkId` alone still counts as non-organic downstream
  // (see `getMarketingAttributedCount` in account-metrics.service.ts).
  const derivedSource =
    incoming.utm_source ??
    (incoming.link_id ? 'link' : null) ??
    (incoming.gclid ? 'google' : incoming.fbclid ? 'facebook' : incoming.ttclid ? 'tiktok' : null);

  const payload: MarketingAttributionPayload = {
    source:   derivedSource,
    medium:   incoming.utm_medium,
    campaign: incoming.utm_campaign,
    content:  incoming.utm_content,
    term:     incoming.utm_term,
    linkId:   incoming.link_id,
    landingPage: `${window.location.pathname}${window.location.search}`,
    referrer: (typeof document !== 'undefined' && document.referrer) || null,
    // Pick whichever click-id is present — Google → Meta → TikTok.
    adId: incoming.gclid ?? incoming.fbclid ?? incoming.ttclid ?? null,
    firstSeenAt: Date.now(),
  };

  setOnboardingPref(STORAGE_KEY, JSON.stringify(payload));

  return payload;
}

/**
 * Read the cached attribution payload synchronously (localStorage fast
 * cache only — does not check the native Preferences fallback). Suitable
 * for the idempotency check inside `captureMarketingAttribution` and any
 * UI that wants a quick, non-blocking peek.
 */
export function readMarketingAttribution(): MarketingAttributionPayload | null {
  const raw = getOnboardingPref(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MarketingAttributionPayload;
  } catch {
    return null;
  }
}

/**
 * Read the cached attribution payload with the native durability fallback
 * (@capacitor/preferences) if the localStorage fast cache is empty — i.e.
 * exactly the WKWebView-eviction case this module's storage tier exists
 * to survive. Use this at the COMPLETED write gate where the extra
 * `await` is cheap and correctness matters more than latency.
 */
export async function readMarketingAttributionAsync(): Promise<MarketingAttributionPayload | null> {
  const raw = await getOnboardingPrefAsync(STORAGE_KEY);
  if (!raw) return null;
  try {
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
 * /typed entry that never hit a capture page, or genuine cross-launch
 * eviction of both storage tiers):
 *   • source       → 'organic'   (so analytics queries don't break on null)
 *   • everything else → null
 *   • capturedAt   → serverTimestamp()
 *   • estimatedCAC → null
 */
export async function buildAttributionPayload(): Promise<MarketingAttributionDoc> {
  const cached = await readMarketingAttributionAsync();
  return {
    source:       cached?.source      ?? 'organic',
    medium:       cached?.medium      ?? null,
    campaign:     cached?.campaign    ?? null,
    content:      cached?.content     ?? null,
    term:         cached?.term        ?? null,
    linkId:       cached?.linkId      ?? null,
    landingPage:  cached?.landingPage ?? null,
    referrer:     cached?.referrer    ?? null,
    adId:         cached?.adId        ?? null,
    firstSeenAt:  cached?.firstSeenAt ?? null,
    capturedAt:   serverTimestamp(),
    estimatedCAC: null,
  };
}
