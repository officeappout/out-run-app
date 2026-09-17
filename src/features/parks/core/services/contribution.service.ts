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
  const payload: any = { ...data, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
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

// ── Approval ─────────────────────────────────────────────────────

export async function approveNewLocation(
  contribution: UserContribution,
  adminId: string,
): Promise<string> {
  const parkId = await createPark({
    name: contribution.parkName ?? 'מיקום חדש',
    location: contribution.location,
    facilityType: contribution.facilityType,
    featureTags: contribution.featureTags ?? [],
    gymEquipment: contribution.gymEquipment ?? [],
    authorityId: contribution.authorityId,
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
