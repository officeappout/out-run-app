/**
 * Feed Service — creates & reads feed_posts in Firestore.
 *
 * Firestore schema:
 *   feed_posts/{autoId} → FeedPost
 *
 * Activity Credit: strength × 2, cardio/maintenance × 1
 */

import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type FeedPostType = 'workout';
export type FeedAudience = 'public' | 'partners' | 'private';

export interface FeedPost {
  id: string;
  authorUid: string;
  authorName: string;
  type: FeedPostType;
  activityCategory: 'strength' | 'cardio' | 'maintenance';
  durationMinutes: number;
  activityCredit: number;
  distanceKm?: number;
  paceMinPerKm?: number;
  intensityLevel?: string;
  title?: string;
  audience?: FeedAudience;
  reactionCount?: number;
  createdAt: Date;
  // Scope fields for leaderboard queries
  authorityId?: string;
  schoolId?: string;
  parkId?: string;
  parkName?: string;
  ageGroup?: 'minor' | 'adult';
}

// ────────────────────────────────────────────────────────────────────────────
// Activity Credit weight mapping
// ────────────────────────────────────────────────────────────────────────────

const CREDIT_MULTIPLIER: Record<string, number> = {
  strength: 2,
  cardio: 1,
  maintenance: 1,
};

// ────────────────────────────────────────────────────────────────────────────
// Write
// ────────────────────────────────────────────────────────────────────────────

export async function createWorkoutPost(params: {
  authorUid: string;
  authorName: string;
  activityCategory: 'strength' | 'cardio' | 'maintenance';
  durationMinutes: number;
  distanceKm?: number;
  paceMinPerKm?: number;
  intensityLevel?: string;
  title?: string;
  audience?: FeedAudience;
  // Scope fields for leaderboard
  authorityId?: string;
  schoolId?: string;
  parkId?: string;
  parkName?: string;
  ageGroup?: 'minor' | 'adult';
}): Promise<string | null> {
  try {
    // Feature flag guard — skip post creation when community feed is disabled
    try {
      const flagsSnap = await getDoc(doc(db, 'system_config', 'feature_flags'));
      const feedEnabled = flagsSnap.exists()
        ? (flagsSnap.data().enable_community_feed ?? false)
        : false;
      if (!feedEnabled) {
        console.log('[FeedService] Community feed disabled — skipping post creation');
        return null;
      }
    } catch (flagErr) {
      // If we can't read the flag doc, default to NOT posting (safe default)
      console.warn('[FeedService] Could not read feature flags — skipping post:', flagErr);
      return null;
    }
    const multiplier = CREDIT_MULTIPLIER[params.activityCategory] ?? 1;
    const activityCredit = params.durationMinutes * multiplier;

    const ref = await addDoc(collection(db, 'feed_posts'), {
      authorUid: params.authorUid,
      authorName: params.authorName,
      type: 'workout' as FeedPostType,
      activityCategory: params.activityCategory,
      durationMinutes: params.durationMinutes,
      activityCredit,
      distanceKm: params.distanceKm ?? null,
      paceMinPerKm: params.paceMinPerKm ?? null,
      intensityLevel: params.intensityLevel ?? null,
      title: params.title || null,
      audience: params.audience ?? 'partners',
      authorityId: params.authorityId ?? null,
      schoolId: params.schoolId ?? null,
      parkId: params.parkId ?? null,
      parkName: params.parkName ?? null,
      ageGroup: params.ageGroup ?? null,
      createdAt: serverTimestamp(),
    });

    console.log(`[FeedService] Post created: ${ref.id}  (${activityCredit} activity credit)`);
    return ref.id;
  } catch (err) {
    console.error('[FeedService] createWorkoutPost failed:', err);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Read — posts from a list of user IDs
// ────────────────────────────────────────────────────────────────────────────

export async function getFeedPosts(
  authorUids: string[],
  maxResults = 30,
): Promise<FeedPost[]> {
  if (!authorUids.length) return [];

  // Firestore 'in' queries support up to 30 values
  const batches: string[][] = [];
  for (let i = 0; i < authorUids.length; i += 30) {
    batches.push(authorUids.slice(i, i + 30));
  }

  const allPosts: FeedPost[] = [];

  for (const batch of batches) {
    const q = query(
      collection(db, 'feed_posts'),
      where('authorUid', 'in', batch),
      orderBy('createdAt', 'desc'),
      limit(maxResults),
    );

    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data();
      allPosts.push({
        id: d.id,
        authorUid: data.authorUid,
        authorName: data.authorName,
        type: data.type,
        activityCategory: data.activityCategory,
        durationMinutes: data.durationMinutes,
        activityCredit: data.activityCredit ?? data.whoPoints ?? 0,
        distanceKm: data.distanceKm ?? undefined,
        paceMinPerKm: data.paceMinPerKm ?? undefined,
        intensityLevel: data.intensityLevel ?? undefined,
        title: data.title ?? undefined,
        audience: data.audience ?? undefined,
        reactionCount: data.reactionCount ?? 0,
        authorityId: data.authorityId ?? undefined,
        schoolId: data.schoolId ?? undefined,
        parkId: data.parkId ?? undefined,
        parkName: data.parkName ?? undefined,
        ageGroup: data.ageGroup ?? undefined,
        createdAt:
          data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt),
      });
    });
  }

  allPosts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return allPosts.slice(0, maxResults);
}

/**
 * Fetch recent posts by a single user (for profile previews).
 */
export async function getUserPosts(
  uid: string,
  maxResults = 10,
): Promise<FeedPost[]> {
  return getFeedPosts([uid], maxResults);
}
