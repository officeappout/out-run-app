/**
 * Community Intelligence — Contribution Service
 * CRUD for user_contributions + duplicate check + approval logic + XP awards
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type {
  UserContribution,
  ContributionType,
  ContributionStatus,
} from '@/types/contribution.types';
import { XP_REWARDS } from '@/types/contribution.types';
import { createPark, updatePark, getAllParks } from './parks.service';
import type { Park } from '../types/park.types';
import type { ParkRatingSummary } from './park-rating.utils';
import { resolveAuthorityForPoint, parseBoundaryGeoJSON, type AuthorityBoundary } from '@/lib/route-collections/authority-resolution';

const COLLECTION = 'user_contributions';

function toDate(ts: any): Date | undefined {
  if (!ts) return undefined;
  if (ts instanceof Date) return ts;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  return undefined;
}

function normalize(docId: string, data: any): UserContribution {
  return {
    id: docId,
    userId: data.userId ?? '',
    authorityId: data.authorityId ?? undefined,
    type: data.type ?? 'report',
    status: data.status ?? 'pending',
    location: data.location ?? { lat: 0, lng: 0 },
    photoUrl: data.photoUrl ?? undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    parkName: data.parkName ?? undefined,
    facilityType: data.facilityType ?? undefined,
    featureTags: Array.isArray(data.featureTags) ? data.featureTags : undefined,
    isPointOfInterest: data.isPointOfInterest ?? false,
    linkedParkId: data.linkedParkId ?? undefined,
    editDiff: data.editDiff ?? undefined,
    editSummary: data.editSummary ?? undefined,
    issueType: data.issueType ?? undefined,
    description: data.description ?? undefined,
    rating: data.rating ?? undefined,
    comment: data.comment ?? undefined,
    routeDifficulty: data.routeDifficulty ?? undefined,
    routeQuality: data.routeQuality ?? undefined,
    xpAwarded: data.xpAwarded ?? undefined,
    approvedParkId: data.approvedParkId ?? undefined,
  };
}

// ── Haversine distance (meters) ──────────────────────────────────

function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── CRUD ─────────────────────────────────────────────────────────

export async function createContribution(
  data: Omit<UserContribution, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  // status comes from the caller (data.status), not forced here — every
  // existing call site already passes it explicitly. Reviews (ParkDetailSheet)
  // pass 'approved' — auto-approval, no moderation step exists for reviews
  // (no approveReview() anywhere in this file). Every other type still
  // passes 'pending' itself, unchanged, feeding the real moderation queue
  // in /admin/approval-center.
  const payload: any = { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  delete payload.id;
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return ref.id;
}

export async function getContributionsByAuthority(
  authorityId: string,
  type?: ContributionType,
  status?: ContributionStatus,
): Promise<UserContribution[]> {
  try {
    const constraints: any[] = [
      where('authorityId', '==', authorityId),
      orderBy('createdAt', 'desc'),
    ];
    if (type) constraints.splice(1, 0, where('type', '==', type));
    if (status) constraints.splice(1, 0, where('status', '==', status));

    const q = query(collection(db, COLLECTION), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalize(d.id, d.data()));
  } catch (err: any) {
    if (err?.code === 'failed-precondition') {
      console.warn('[Contributions] Index not ready, returning empty.');
      return [];
    }
    console.error('[Contributions] Error fetching:', err);
    return [];
  }
}

export async function getAllContributions(
  status?: ContributionStatus,
): Promise<UserContribution[]> {
  try {
    const constraints: any[] = [orderBy('createdAt', 'desc')];
    if (status) constraints.unshift(where('status', '==', status));
    const q = query(collection(db, COLLECTION), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalize(d.id, d.data()));
  } catch (err) {
    console.error('[Contributions] Error fetching all:', err);
    return [];
  }
}

/**
 * Resolves display names for a set of reviewer UIDs from `userPublic`
 * (never the raw `users/{uid}` doc — that's owner+admin only). Individual
 * `getDoc` reads, not the batched `documentId() in [...]` helper
 * (getUsersByUids in user-search.service.ts) — that helper's `list` query
 * requires `where('ageGroup','==', callerAgeGroup)` (a minor/adult
 * discovery-safety rule) and would silently drop any reviewer on the other
 * side of that split. A review is public park content readable by anyone
 * (firestore.rules: `resource.data.type == 'review'`), so a single `get` by
 * an already-known uid is the right, unrestricted read here — see
 * `userPublic`'s own rule comment ("a profile link... stays unrestricted").
 *
 * A uid with no `userPublic` doc (not discoverable, or account deleted)
 * falls back to 'משתמש' — never the raw uid.
 */
export async function getReviewerNames(uids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  const pairs = await Promise.all(
    unique.map(async (uid): Promise<[string, string]> => {
      try {
        const snap = await getDoc(doc(db, 'userPublic', uid));
        const name = snap.exists() ? (snap.data()?.name as string | undefined) : undefined;
        return [uid, name?.trim() || 'משתמש'];
      } catch {
        return [uid, 'משתמש'];
      }
    }),
  );
  return Object.fromEntries(pairs);
}

/**
 * Fetch reviews for a specific park. Uses a targeted query that satisfies
 * the Firestore security rule (type == 'review') so non-admin users
 * don't trigger a 403 on the user_contributions collection.
 */
export async function getReviewsForPark(parkId: string): Promise<UserContribution[]> {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('type', '==', 'review'),
      where('linkedParkId', '==', parkId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalize(d.id, d.data()));
  } catch (err: any) {
    if (err?.code === 'failed-precondition') {
      console.warn('[Contributions] Index not ready for park reviews, returning empty.');
      return [];
    }
    console.error('[Contributions] Error fetching park reviews:', err);
    return [];
  }
}

/**
 * Recomputes and persists a park's ratingAvg/reviewCount from its current
 * user_contributions reviews, via /api/parks/recompute-rating (server-side,
 * Admin SDK). A direct client write here would fail: firestore.rules gates
 * ALL writes to parks/{docId} on isAdmin(), and per this repo's standing
 * rule that bar gets fixed on the write-path side, never weakened in the
 * rules themselves (axioms.md Verification-First §7) — see the route's own
 * doc comment. The route recomputes from the park's own review docs
 * server-side (computeParkRatingSummary — the same formula the one-time
 * backfill script uses); this function only tells it which park changed.
 *
 * Idempotent (the route always recomputes from source, never increments) —
 * safe to call after every review submit.
 *
 * Swallows its own failure (logs, doesn't throw): the review the user just
 * submitted already succeeded by the time this runs, and a failure to
 * update the denormalized aggregate must never surface as "your review
 * failed" to the submitter.
 */
export async function recomputeAndSaveParkRating(parkId: string): Promise<ParkRatingSummary | null> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('No auth token');
    const res = await fetch('/api/parks/recompute-rating', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ parkId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`recompute-rating API failed: ${body?.error ?? res.status}`);
    }
    const data = await res.json();
    return { ratingAvg: data.ratingAvg ?? null, reviewCount: data.reviewCount ?? 0 };
  } catch (err) {
    console.error('[Contributions] Failed to save park rating summary:', err);
    return null;
  }
}

// ── Duplicate check (50 m radius) ────────────────────────────────

export async function checkDuplicateNearby(
  lat: number,
  lng: number,
  radiusM = 50,
): Promise<Park | null> {
  const parks = await getAllParks();
  for (const p of parks) {
    if (!p.location) continue;
    const dist = haversineM(lat, lng, p.location.lat, p.location.lng);
    if (dist <= radiusM) return p;
  }
  return null;
}

// ── Authority resolution ────────────────────────────────────────────

/**
 * Types that must never become park.authorityId. Verified against the live
 * `authorities` collection (23.09.2026): every type actually present is
 * neighborhood(1377) | settlement(1066) | local_council(123) | city(83) |
 * regional_council(55) | military_unit(48) | school(2) | no-type(1). Two
 * different reasons land a type here, not one:
 *   - neighborhood, settlement — sub-city LEAVES (locked invariant, see
 *     park-neighborhood-model: authorityId is always the TOP authority, the
 *     leaf goes in neighborhoodId instead).
 *   - military_unit, school — not municipal authorities at all. Israel has
 *     exactly three kinds of real municipal authority: city (עירייה), local
 *     council (מועצה מקומית), regional council (מועצה אזורית) — that's the
 *     complete set (KNOWN_TOP_AUTHORITY_TYPES below). A school or military
 *     unit polygon must never claim a park's municipal jurisdiction, even
 *     though today (23.09.2026) neither type carries boundary/radius data —
 *     so this is currently a no-op protecting against tomorrow, not today.
 *
 * This is a DENYLIST, not an allowlist, on purpose — an earlier version of
 * this function used `where('type','in',['city','regional_council'])`,
 * which silently excluded every `local_council` authority (123 of them,
 * real top-level municipalities — Zichron Yaakov's own boundary data landed
 * the same week, and would have been unreachable through that allowlist).
 * That's the exact same class of bug as the createPark write-whitelist that
 * dropped published/contentStatus/origin (23.09.2026, same audit): a value
 * nobody enumerated in advance disappears without a trace. A denylist of the
 * types that must NEVER qualify, plus a loud warning (not a silent drop)
 * for anything neither allowed nor denied, degrades safely instead.
 */
const EXCLUDED_AUTHORITY_TYPES = new Set(['neighborhood', 'settlement', 'military_unit', 'school']);

/** Types confirmed to be real top-level authorities — no warning for these. */
const KNOWN_TOP_AUTHORITY_TYPES = new Set(['city', 'regional_council', 'local_council']);

/**
 * Fetches every eligible authority as an AuthorityBoundary for
 * resolveAuthorityForPoint() — id/name/boundaryGeoJSON/coordinates/radiusKm
 * only, no CRM fields (contacts, documents, financials). Reads the whole
 * collection (2,755 docs) rather than a Firestore `where` filter: approvals
 * are rare/manual, not a hot path, and a JS-side denylist is what lets an
 * unrecognized type pass through with a warning instead of vanishing inside
 * a query filter with no visibility at all.
 */
async function fetchAuthorityBoundaries(): Promise<AuthorityBoundary[]> {
  const snap = await getDocs(collection(db, 'authorities'));
  const result: AuthorityBoundary[] = [];
  const unrecognizedTypes = new Map<string, number>();

  for (const d of snap.docs) {
    const data = d.data();
    const type = data.type ?? '(no type)';
    if (EXCLUDED_AUTHORITY_TYPES.has(type)) continue;
    if (!KNOWN_TOP_AUTHORITY_TYPES.has(type)) {
      unrecognizedTypes.set(type, (unrecognizedTypes.get(type) ?? 0) + 1);
    }
    result.push({
      id: d.id,
      name: data.name ?? '',
      // Firestore rejects the nested-array shape of a raw GeoJSON Feature,
      // so authorities/{id}.boundaryGeoJSON is stored as a JSON string
      // (see parseBoundaryGeoJSON's own header comment, authority-boundary
      // pipeline step). This fetch reads the collection directly rather
      // than through authority.service.ts's Authority mapper (the one
      // other place that parses it), so it must parse it here too — a raw
      // string reaching isPointInPolygon crashes or silently mis-resolves
      // instead of just failing to match, no different than every other
      // authority with no boundary at all.
      boundaryGeoJSON: parseBoundaryGeoJSON(data.boundaryGeoJSON) ?? undefined,
      coordinates: data.coordinates ?? undefined,
      radiusKm: data.radiusKm ?? undefined,
    });
  }

  if (unrecognizedTypes.size > 0) {
    console.warn(
      '[Contributions] fetchAuthorityBoundaries: unrecognized authority type(s) included as resolution candidates (not silently dropped) —',
      Object.fromEntries(unrecognizedTypes),
    );
  }

  return result;
}

/**
 * Pure — no I/O. Resolves a contribution's authorityId from its coordinates
 * via resolveAuthorityForPoint(), falling back to any authorityId the caller
 * already had (no current caller sets one, but this never regresses one that
 * does). needsAuthorityTagging is true whenever neither source produced an id
 * — resolution failed with no fallback, or the point is ambiguous between
 * more than one authority's boundary. Never blocks park creation.
 */
export function resolveContributionAuthority(
  location: { lat: number; lng: number } | null | undefined,
  existingAuthorityId: string | undefined,
  authorities: AuthorityBoundary[],
): { authorityId: string | undefined; needsAuthorityTagging: boolean } {
  const resolution = location ? resolveAuthorityForPoint(location, authorities) : { status: 'unresolved' as const };
  const authorityId = resolution.status === 'resolved' ? resolution.authorityId : existingAuthorityId;
  return { authorityId, needsAuthorityTagging: !authorityId };
}

// ── Approval ─────────────────────────────────────────────────────

export async function approveNewLocation(
  contribution: UserContribution,
  adminId: string,
): Promise<string> {
  const authorities = await fetchAuthorityBoundaries();
  const { authorityId, needsAuthorityTagging } = resolveContributionAuthority(
    contribution.location,
    contribution.authorityId,
    authorities,
  );

  const parkId = await createPark({
    name: contribution.parkName ?? 'מיקום חדש',
    location: contribution.location,
    facilityType: contribution.facilityType,
    featureTags: contribution.featureTags ?? [],
    gymEquipment: contribution.gymEquipment ?? [],
    authorityId,
    needsAuthorityTagging,
    image: contribution.photoUrl,
    status: 'open',
    contentStatus: 'published',
    published: true,
    origin: 'authority_admin',
    createdByUser: contribution.userId,
  });

  const xp = XP_REWARDS.new_location;
  await updateDoc(doc(db, COLLECTION, contribution.id!), {
    status: 'approved',
    approvedParkId: parkId,
    xpAwarded: xp,
    updatedAt: serverTimestamp(),
  });

  await awardXP(contribution.userId, xp);
  return parkId;
}

export async function approveSuggestEdit(
  contribution: UserContribution,
  adminId: string,
): Promise<void> {
  if (!contribution.linkedParkId || !contribution.editDiff) {
    throw new Error('Missing linkedParkId or editDiff for suggest_edit approval');
  }

  await updatePark(contribution.linkedParkId, contribution.editDiff as any);

  const xp = XP_REWARDS.suggest_edit;
  await updateDoc(doc(db, COLLECTION, contribution.id!), {
    status: 'approved',
    xpAwarded: xp,
    updatedAt: serverTimestamp(),
  });

  await awardXP(contribution.userId, xp);
}

export async function rejectContribution(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  });
}

// ── XP ───────────────────────────────────────────────────────────

async function awardXP(_userId: string, xp: number): Promise<void> {
  // Routed through the Guardian; firestore.rules block direct client writes
  // to progression.globalXP. The Guardian derives the uid from request.auth,
  // so contributors can only credit XP to themselves.
  try {
    const { awardWorkoutXP } = await import('@/lib/awardWorkoutXP');
    await awardWorkoutXP({ xpDelta: xp, source: 'park-contribution' });
  } catch (err) {
    console.error('[Contributions] Failed to award XP:', err);
  }
}
