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
  getDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { applyFeedPrefs, feedPrefsFrom, savePendingShare } from './feed-prefs';
import { alignScopeWithAuthorDoc } from './feed-scope.utils';
import { postDetailsForWrite, withoutPostDetails, type FeedPostDetails } from './feed-post-details';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type FeedPostType = 'workout';
export type FeedAudience = 'public' | 'partners' | 'private';

export interface FeedPost extends FeedPostDetails {
  id: string;
  authorUid: string;
  authorName: string;
  type: FeedPostType;
  activityCategory: 'strength' | 'cardio' | 'maintenance';
  durationMinutes: number;
  activityCredit: number;
  distanceKm?: number;
  paceMinPerKm?: number;
  /** Average pace in seconds per km. Used for segment leaderboards. */
  paceSecPerKm?: number;
  /** Completed distance segment bracket. */
  runSegment?: '3k' | '5k' | '10k' | null;
  intensityLevel?: string;
  title?: string;
  audience?: FeedAudience;
  reactionCount?: number;
  createdAt: Date;
  // Scope fields for leaderboard queries
  authorityId?: string;
  neighborhoodId?: string;
  schoolId?: string;
  parkId?: string;
  parkName?: string;
  ageGroup?: 'minor' | 'adult';
  gender?: 'male' | 'female' | 'other';
  programId?: string;
  /** IDs of community_groups the author belongs to at post time.
   *  Used by array-contains queries for group/league leaderboards. */
  groupIds?: string[];
  /**
   * Cardio only, optional: the run's line as a location-free shape —
   * flat [x0, y0, x1, y1, …] integers in a 0..1000 box, first/last 200 m
   * cut (feed-route.ts buildRouteShape). Never coordinates.
   */
  routeShape?: number[];
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
  paceSecPerKm?: number;
  runSegment?: '3k' | '5k' | '10k' | null;
  intensityLevel?: string;
  title?: string;
  audience?: FeedAudience;
  // Scope fields for leaderboard
  authorityId?: string;
  neighborhoodId?: string;
  schoolId?: string;
  parkId?: string;
  parkName?: string;
  ageGroup?: 'minor' | 'adult';
  gender?: 'male' | 'female' | 'other';
  programId?: string;
  /** Snapshot of the author's joined group IDs at post time. */
  groupIds?: string[];
  /** Location-free route line (feed-route.ts) — cardio, home v2 only. */
  routeShape?: number[];
} & FeedPostDetails, opts: {
  /**
   * The user tapped "share" (the feed's share prompt). Without it a post is
   * published only when the author turned auto-publish on for this activity
   * (users/{uid}.social.feedPrefs); otherwise it's kept as a pending share.
   */
  manual?: boolean;
  /**
   * Home v2: one photo the user picked in the share sheet (already
   * compressed — feed-photo.ts). Uploaded only when the post is published;
   * an upload failure publishes the post without it.
   */
  photo?: Blob | null;
} = {}): Promise<string | null> {
  try {
    // Feature flag guard — skip post creation when community feed is disabled
    let flags: Record<string, unknown>;
    try {
      const flagsSnap = await getDoc(doc(db, 'system_config', 'feature_flags'));
      flags = flagsSnap.exists() ? flagsSnap.data() : {};
    } catch (flagErr) {
      // If we can't read the flag doc, default to NOT posting (safe default)
      console.warn('[FeedService] Could not read feature flags — skipping post:', flagErr);
      return null;
    }
    // The author's own doc: feed prefs, the super-admin bit, and the scope
    // values the create rule checks against. Can't read it → treat as "not
    // opted in": hold it as a share prompt rather than publish.
    let me: Record<string, unknown> | undefined;
    try {
      me = (await getDoc(doc(db, 'users', params.authorUid))).data();
    } catch (prefsErr) {
      console.warn('[FeedService] Could not read feed prefs — holding as a share prompt:', prefsErr);
    }
    // Super admins see the feed even while the admin toggle is off
    // (useFeatureFlags superAdminValue) — so they must be able to post to it
    // too; before, their workouts were dropped here without even a prompt.
    const isSuperAdmin = (me?.core as { isSuperAdmin?: unknown } | undefined)?.isSuperAdmin === true;
    if (!(flags.enable_community_feed ?? false) && !isSuperAdmin) {
      console.log('[FeedService] Community feed disabled — skipping post creation');
      return null;
    }
    // The route line is a home v2 post (enable_home_v2, super admins always).
    // So are the detail fields (feed-post-details.ts) and the photo.
    const homeV2 = flags.enable_home_v2 === true || isSuperAdmin;
    if (!homeV2) {
      params = withoutPostDetails(params);
      if (params.routeShape) {
        params = { ...params };
        delete params.routeShape;
      }
    }
    // Opt-in publishing (feed-prefs.ts).
    const prefsRaw = (me?.social as { feedPrefs?: unknown } | undefined)?.feedPrefs;
    const decision = applyFeedPrefs(params, feedPrefsFrom(prefsRaw), !!opts.manual);
    if (!decision.publish) {
      savePendingShare(params);
      console.log('[FeedService] Auto-publish off for', params.activityCategory, '— kept as a share prompt');
      return null;
    }
    // Rule-checked scope fields must equal the author's doc (feed-scope.utils).
    params = alignScopeWithAuthorDoc(decision.params, me);

    // The photo goes up only now that the post is really being published.
    if (homeV2 && opts.photo) {
      try {
        const { uploadFeedPhoto } = await import('./feed-photo');
        const up = await uploadFeedPhoto(params.authorUid, opts.photo);
        params = { ...params, photoUrl: up.url, photoPath: up.path };
      } catch (photoErr) {
        console.warn('[FeedService] Photo upload failed — publishing without it:', photoErr);
      }
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
      paceSecPerKm: params.paceSecPerKm ?? null,
      runSegment: params.runSegment ?? null,
      intensityLevel: params.intensityLevel ?? null,
      title: params.title || null,
      audience: params.audience ?? 'partners',
      authorityId: params.authorityId ?? null,
      neighborhoodId: params.neighborhoodId ?? null,
      schoolId: params.schoolId ?? null,
      parkId: params.parkId ?? null,
      parkName: params.parkName ?? null,
      ageGroup: params.ageGroup ?? null,
      gender: params.gender ?? null,
      programId: params.programId ?? null,
      groupIds: params.groupIds ?? [],
      ...(params.activityCategory === 'cardio' && params.routeShape && params.routeShape.length >= 6
        ? { routeShape: params.routeShape }
        : {}),
      ...postDetailsForWrite(params),
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

/**
 * Feed posts through /api/feed (Admin SDK + canSeePost — feed-visibility.ts),
 * so a 'partners' post only reaches the author's mutual follows. The server
 * decides the authors itself: the caller + whom they follow, or one author.
 * Any failure → [] (never fall back to a direct read that skips the check).
 */
async function fetchFeed(params: Record<string, string>): Promise<FeedPost[]> {
  try {
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    if (!idToken) return [];
    const res = await fetch(`/api/feed?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const body = (await res.json()) as { posts: (Omit<FeedPost, 'createdAt'> & { createdAt: string })[] };
    return (body.posts ?? []).map((p) => ({ ...p, createdAt: new Date(p.createdAt) }));
  } catch (err) {
    console.error('[feed.service] fetchFeed failed:', err);
    return [];
  }
}

/**
 * The home feed: the caller and everyone they follow. `authorUids` is kept
 * for the call sites' signature — the server derives the same list itself.
 */
export async function getFeedPosts(
  authorUids: string[],
  maxResults = 30,
): Promise<FeedPost[]> {
  if (!authorUids.length) return [];
  return fetchFeed({ max: String(maxResults) });
}

/**
 * Fetch recent posts by a single user (for profile previews) — only the ones
 * the caller may see.
 */
export async function getUserPosts(
  uid: string,
  maxResults = 10,
): Promise<FeedPost[]> {
  return fetchFeed({ author: uid, max: String(maxResults) });
}

// ────────────────────────────────────────────────────────────────────────────
// Delete (Compliance Phase 7.1 — author erasure)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Permanently remove the author's own post.
 *
 * Authorization: Firestore rules (`feed_posts/{docId}` — Phase 3.2) gate
 * deletes to `request.auth.uid == resource.data.authorUid`, so a non-author
 * call will be rejected by the security rule. We do not re-validate the
 * author here — the server is the source of truth.
 *
 * Side effects: only the post document is removed. Reactions in the
 * `feed_posts/{id}/reactions/{uid}` subcollection become orphaned by
 * design — a future Cloud Function trigger (`onFeedPostDelete`) will
 * sweep them; cleaning up client-side is unsafe for popular posts
 * because we'd have to read & batch-delete an unbounded subcollection
 * from an authenticated user that may not even own those reaction docs.
 */
export async function deleteFeedPost(postId: string, photoPath?: string): Promise<void> {
  await deleteDoc(doc(db, 'feed_posts', postId));
  // Home v2: the post's photo (feed-photo.ts) goes with it — best-effort.
  if (photoPath) {
    const { deleteFeedPhoto } = await import('./feed-photo');
    await deleteFeedPhoto(photoPath);
  }
}
