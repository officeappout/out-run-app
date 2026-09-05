/**
 * Marketing Links Service — Growth Funnel UTM Registry.
 *
 * The Admin Panel "מרכז ניהול קישורים שיווקיים" surfaces this service to
 * let growth managers mint trackable smart links in a single place. Each
 * link captures:
 *   • A human-friendly internal name (used inside the registry UI only).
 *   • The canonical OneLink / share URL the user actually clicks.
 *   • UTM parameters (source / medium / campaign) that the onboarding
 *     pipeline funnels into `users/{uid}.marketingAttribution` via
 *     `src/lib/marketingAttribution.ts`.
 *   • A server-incremented `clicksCount` updated from the public click-
 *     tracking route at `/api/links/[id]/click`.
 *
 * Collection: `marketing_links/{id}` (top-level).
 *
 * Security: admin-only writes; the `/api/links/[id]/click` route uses the
 * Admin SDK to bypass client rules so an anonymous browser visit can
 * still atomically bump `clicksCount`.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  increment,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { LinkDestinations } from './link-routing';

const COLLECTION = 'marketing_links' as const;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Channel classification for a marketing link. Distinguishes a physical QR
 * (rollup banner, flyer) from a link posted online or sent via email — the
 * two look identical as a raw `clicksCount` but mean very different things
 * to a growth report.
 */
export const LINK_TYPES = ['qr_physical', 'web', 'paid_ads', 'email', 'partner', 'other'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

/**
 * Canonical short-link/web domain — reads from an env var, NEVER
 * hardcoded, so a domain cutover (planned: outrun.co.il → appout.co.il)
 * is a single Vercel env var change, not a code change. Works in both
 * server code (link-click-handler.ts) and client code (admin/links
 * live preview) because `NEXT_PUBLIC_*` vars are inlined at build time
 * for both. The literal fallback matches today's live domain so nothing
 * breaks if the var isn't set yet (e.g. local dev) — but it MUST be set
 * explicitly in Vercel (to today's value) before cutover day, or the
 * "change one value" plan doesn't hold.
 */
export const SHORT_LINK_DOMAIN =
  process.env.NEXT_PUBLIC_SHORT_LINK_DOMAIN || 'https://outrun.co.il';

/**
 * Global default destination URLs, used by any link with `useSmartLink:
 * true` that doesn't override a given slot. Real, verified live listings
 * (checked 05.09.2026) — NOT what's in `capacitor.config.ts`'s `appId`
 * (`co.il.appout.outrun`), which does not match the actually-published
 * Play Store package. The app is published under the dev shop's own
 * developer account (`il.co.oversight.outapp` — "Oversight" is OUT's
 * outsourced dev shop, see `finance-vendors.seed.ts`). Flagging this
 * discrepancy explicitly — it is NOT something this change fixes.
 */
export const DEFAULT_LINK_DESTINATIONS: LinkDestinations = {
  iosUrl: 'https://apps.apple.com/il/app/out/id6502558672',
  androidUrl: 'https://play.google.com/store/apps/details?id=il.co.oversight.outapp',
  desktopUrl: SHORT_LINK_DOMAIN,
  fallbackUrl: SHORT_LINK_DOMAIN,
};

/**
 * A single trackable marketing link as persisted in Firestore.
 *
 * Field rationale
 * ───────────────
 *   • `id`                  Firestore doc id, exposed to API routes.
 *   • `friendlyName`        Internal label visible only in the registry UI.
 *   • `oneLinkUrl`          The bare share URL (before UTM concatenation),
 *                           e.g. `${SHORT_LINK_DOMAIN}/gateway`.
 *   • `utmSource/Medium/Campaign`
 *                           UTM tokens — when present, the public click
 *                           handler synthesises the final tracking URL by
 *                           appending them as `?utm_*` query params.
 *   • `clicksCount`         Server-incremented via the click route.
 *   • `isActive`            Disable a link without losing its history.
 *   • `notes`               Free-form admin annotations.
 *   • `createdAt / updatedAt`  Firestore Timestamps.
 *   • `createdBy / updatedBy`  Audit trail (admin UID).
 */
export interface MarketingLink {
  id: string;
  friendlyName: string;
  oneLinkUrl: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  /** Channel classification — see `LINK_TYPES`. Defaults to 'web' when unset. */
  linkType: LinkType;
  /** Free-text physical location, e.g. "גן העירוני, רעננה" — only meaningful for `qr_physical`. */
  physicalLocation: string | null;
  /**
   * Opt-in per link. `false`/absent (all pre-existing links) = untouched
   * legacy behaviour — redirect to `oneLinkUrl`+utm (today's onelink.to
   * flow). `true` = device-based routing straight to the store using
   * `iosUrl`/`androidUrl`/`desktopUrl`/`fallbackUrl` (falling back to
   * `DEFAULT_LINK_DESTINATIONS` per empty slot), skipping onelink.to
   * entirely. Deliberately per-link, not a global switch — "no big-bang
   * migration" per the agreed rollout plan.
   */
  useSmartLink: boolean;
  iosUrl: string | null;
  androidUrl: string | null;
  desktopUrl: string | null;
  fallbackUrl: string | null;
  clicksCount: number;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

/** Payload accepted by `createMarketingLink`. */
export interface CreateMarketingLinkInput {
  friendlyName: string;
  /** Required unless `useSmartLink: true` — Smart Link mode routes via
   * `iosUrl`/`androidUrl`/`desktopUrl`/`fallbackUrl` instead. */
  oneLinkUrl?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  linkType?: LinkType;
  physicalLocation?: string | null;
  useSmartLink?: boolean;
  iosUrl?: string | null;
  androidUrl?: string | null;
  desktopUrl?: string | null;
  fallbackUrl?: string | null;
  isActive?: boolean;
  notes?: string;
  createdBy?: string;
}

/** Payload accepted by `updateMarketingLink`. */
export interface UpdateMarketingLinkInput {
  friendlyName?: string;
  oneLinkUrl?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  linkType?: LinkType;
  physicalLocation?: string | null;
  useSmartLink?: boolean;
  iosUrl?: string | null;
  androidUrl?: string | null;
  desktopUrl?: string | null;
  fallbackUrl?: string | null;
  isActive?: boolean;
  notes?: string;
  updatedBy?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tsToDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return new Date();
}

function nullishString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Falls back to 'web' for missing/legacy docs and any unrecognised value. */
function toLinkType(v: unknown): LinkType {
  return (LINK_TYPES as readonly string[]).includes(v as string) ? (v as LinkType) : 'web';
}

function rowToLink(id: string, data: Record<string, unknown>): MarketingLink {
  return {
    id,
    friendlyName:
      typeof data.friendlyName === 'string' ? data.friendlyName : '',
    oneLinkUrl:
      typeof data.oneLinkUrl === 'string' ? data.oneLinkUrl : '',
    utmSource: nullishString(data.utmSource),
    utmMedium: nullishString(data.utmMedium),
    utmCampaign: nullishString(data.utmCampaign),
    linkType: toLinkType(data.linkType),
    physicalLocation: nullishString(data.physicalLocation),
    useSmartLink: data.useSmartLink === true,
    iosUrl: nullishString(data.iosUrl),
    androidUrl: nullishString(data.androidUrl),
    desktopUrl: nullishString(data.desktopUrl),
    fallbackUrl: nullishString(data.fallbackUrl),
    clicksCount:
      typeof data.clicksCount === 'number' && Number.isFinite(data.clicksCount)
        ? data.clicksCount
        : 0,
    isActive: data.isActive !== false, // Default to true when missing.
    notes: typeof data.notes === 'string' ? data.notes : undefined,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
    createdBy:
      typeof data.createdBy === 'string' ? data.createdBy : undefined,
    updatedBy:
      typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
  };
}

/**
 * Build the fully resolved tracking URL for a link by concatenating its
 * UTM tokens onto the base `oneLinkUrl`. Idempotent — if the base URL
 * already contains query params they're preserved; if it already has a
 * `utm_*` param, the stored UTM token wins (the registry is the source
 * of truth).
 *
 * Exposed here so the Admin Panel preview pane and the public click
 * route can share one implementation.
 */
export function buildTrackingUrl(link: Pick<MarketingLink,
  'oneLinkUrl' | 'utmSource' | 'utmMedium' | 'utmCampaign'>
): string {
  if (!link.oneLinkUrl) return '';
  let url: URL;
  try {
    url = new URL(link.oneLinkUrl);
  } catch {
    // Not a valid absolute URL — return the raw value so the admin can
    // still see and copy whatever they typed.
    return link.oneLinkUrl;
  }
  if (link.utmSource) url.searchParams.set('utm_source', link.utmSource);
  if (link.utmMedium) url.searchParams.set('utm_medium', link.utmMedium);
  if (link.utmCampaign) url.searchParams.set('utm_campaign', link.utmCampaign);
  return url.toString();
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a new marketing link. Returns the generated doc id so the caller
 * can immediately render the new row without a round-trip.
 */
export async function createMarketingLink(
  input: CreateMarketingLinkInput,
): Promise<string> {
  if (!input.friendlyName?.trim()) {
    throw new Error('friendlyName is required');
  }
  if (!input.useSmartLink && !input.oneLinkUrl?.trim()) {
    throw new Error('oneLinkUrl is required unless useSmartLink is true');
  }

  const ref = await addDoc(collection(db, COLLECTION), {
    friendlyName: input.friendlyName.trim(),
    oneLinkUrl: input.oneLinkUrl?.trim() ?? '',
    utmSource: nullishString(input.utmSource ?? null),
    utmMedium: nullishString(input.utmMedium ?? null),
    utmCampaign: nullishString(input.utmCampaign ?? null),
    linkType: toLinkType(input.linkType),
    physicalLocation: nullishString(input.physicalLocation ?? null),
    useSmartLink: input.useSmartLink === true,
    iosUrl: nullishString(input.iosUrl ?? null),
    androidUrl: nullishString(input.androidUrl ?? null),
    desktopUrl: nullishString(input.desktopUrl ?? null),
    fallbackUrl: nullishString(input.fallbackUrl ?? null),
    clicksCount: 0,
    isActive: input.isActive !== false,
    notes: typeof input.notes === 'string' ? input.notes : '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: input.createdBy ?? null,
    updatedBy: input.createdBy ?? null,
  });
  return ref.id;
}

/**
 * Read all marketing links, newest first. Suitable for the admin table —
 * the registry is expected to stay small (tens / low-hundreds of links),
 * so a paged query is overkill until we hit that scale.
 */
export async function getMarketingLinks(): Promise<MarketingLink[]> {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => rowToLink(d.id, d.data() as Record<string, unknown>));
}

/** Single-link read by id. Returns null when the doc doesn't exist. */
export async function getMarketingLink(id: string): Promise<MarketingLink | null> {
  if (!id) return null;
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return rowToLink(snap.id, snap.data() as Record<string, unknown>);
}

/**
 * Patch one or more fields. Only keys actually present in `input` are
 * written — undefined values are skipped (vs. null which IS persisted).
 */
export async function updateMarketingLink(
  id: string,
  input: UpdateMarketingLinkInput,
): Promise<void> {
  if (!id) throw new Error('id is required');

  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (input.friendlyName !== undefined) patch.friendlyName = input.friendlyName.trim();
  if (input.oneLinkUrl !== undefined) patch.oneLinkUrl = input.oneLinkUrl.trim();
  if (input.utmSource !== undefined) patch.utmSource = nullishString(input.utmSource);
  if (input.utmMedium !== undefined) patch.utmMedium = nullishString(input.utmMedium);
  if (input.utmCampaign !== undefined) patch.utmCampaign = nullishString(input.utmCampaign);
  if (input.linkType !== undefined) patch.linkType = toLinkType(input.linkType);
  if (input.physicalLocation !== undefined) patch.physicalLocation = nullishString(input.physicalLocation);
  if (input.useSmartLink !== undefined) patch.useSmartLink = !!input.useSmartLink;
  if (input.iosUrl !== undefined) patch.iosUrl = nullishString(input.iosUrl);
  if (input.androidUrl !== undefined) patch.androidUrl = nullishString(input.androidUrl);
  if (input.desktopUrl !== undefined) patch.desktopUrl = nullishString(input.desktopUrl);
  if (input.fallbackUrl !== undefined) patch.fallbackUrl = nullishString(input.fallbackUrl);
  if (input.isActive !== undefined) patch.isActive = !!input.isActive;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.updatedBy !== undefined) patch.updatedBy = input.updatedBy;

  await updateDoc(doc(db, COLLECTION, id), patch);
}

/** Hard-delete a marketing link by id. */
export async function deleteMarketingLink(id: string): Promise<void> {
  if (!id) throw new Error('id is required');
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Atomically increment the click counter for a marketing link.
 *
 * Intended to be called from the anonymous click route
 * (`src/app/api/links/[id]/click/route.ts`). Uses `increment(1)` so two
 * concurrent visits don't race and lose a count.
 *
 * Returns the updated count (best-effort: we re-fetch after the write).
 * On read failure we return null without surfacing the error — the
 * counter HAS been incremented, the redirect must still succeed.
 */
export async function incrementClickCount(id: string): Promise<number | null> {
  if (!id) throw new Error('id is required');
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, {
    clicksCount: increment(1),
    lastClickAt: serverTimestamp(),
  });
  try {
    const snap = await getDoc(ref);
    const count = (snap.data() as Record<string, unknown> | undefined)?.clicksCount;
    return typeof count === 'number' && Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}
