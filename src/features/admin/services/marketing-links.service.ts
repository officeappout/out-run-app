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

const COLLECTION = 'marketing_links' as const;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single trackable marketing link as persisted in Firestore.
 *
 * Field rationale
 * ───────────────
 *   • `id`                  Firestore doc id, exposed to API routes.
 *   • `friendlyName`        Internal label visible only in the registry UI.
 *   • `oneLinkUrl`          The bare share URL (before UTM concatenation),
 *                           e.g. 'https://outrun.co.il/gateway'.
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
  oneLinkUrl: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
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
  if (!input.oneLinkUrl?.trim()) {
    throw new Error('oneLinkUrl is required');
  }

  const ref = await addDoc(collection(db, COLLECTION), {
    friendlyName: input.friendlyName.trim(),
    oneLinkUrl: input.oneLinkUrl.trim(),
    utmSource: nullishString(input.utmSource ?? null),
    utmMedium: nullishString(input.utmMedium ?? null),
    utmCampaign: nullishString(input.utmCampaign ?? null),
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
