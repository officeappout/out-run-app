/**
 * Who may see a feed post — pure, no Firebase (used by /api/feed).
 *
 * Why (David, 17.10.2026): the rules let ANY signed-in user read a
 * 'partners' post; only the client's own authorUid list limited it. The feed
 * now loads through /api/feed (Admin SDK), which applies this check per post,
 * so 'partners' really means partners (a mutual follow) whatever the rules say.
 */
import { sanitizePostDetails } from './feed-post-details';

export interface PostAccessFields {
  authorUid: string;
  audience?: string | null;
}

export interface AuthorConnections {
  following?: string[];
  followers?: string[];
}

/** Partner = mutual follow (same as useSocialStore.isPartner). */
export function isMutual(conn: AuthorConnections | null | undefined, viewerUid: string): boolean {
  return !!conn && (conn.following ?? []).includes(viewerUid) && (conn.followers ?? []).includes(viewerUid);
}

export function canSeePost(
  post: PostAccessFields,
  viewerUid: string,
  authorConn: AuthorConnections | null | undefined,
): boolean {
  if (post.authorUid === viewerUid) return true;
  const audience = post.audience ?? 'partners'; // legacy posts: the stricter reading
  if (audience === 'public') return true;
  if (audience === 'private') return false;
  return isMutual(authorConn, viewerUid);
}

/** Firestore doc data → the FeedPost JSON the client gets (createdAt as ISO). */
export function feedPostJson(id: string, data: Record<string, unknown>): Record<string, unknown> {
  const created = data.createdAt as { toDate?: () => Date } | string | number | undefined;
  const createdAt =
    created && typeof created === 'object' && typeof created.toDate === 'function'
      ? created.toDate().toISOString()
      : new Date((created as string | number | undefined) ?? Date.now()).toISOString();
  const pick = (k: string) => (data[k] ?? undefined);
  return {
    id,
    authorUid: data.authorUid,
    authorName: data.authorName,
    type: data.type,
    activityCategory: data.activityCategory,
    durationMinutes: data.durationMinutes,
    activityCredit: data.activityCredit ?? data.whoPoints ?? 0,
    distanceKm: pick('distanceKm'),
    paceMinPerKm: pick('paceMinPerKm'),
    paceSecPerKm: pick('paceSecPerKm'),
    runSegment: pick('runSegment'),
    intensityLevel: pick('intensityLevel'),
    title: pick('title'),
    audience: pick('audience'),
    reactionCount: data.reactionCount ?? 0,
    authorityId: pick('authorityId'),
    neighborhoodId: pick('neighborhoodId'),
    schoolId: pick('schoolId'),
    parkId: pick('parkId'),
    parkName: pick('parkName'),
    ageGroup: pick('ageGroup'),
    gender: pick('gender'),
    programId: pick('programId'),
    groupIds: Array.isArray(data.groupIds) ? data.groupIds : undefined,
    routeShape: Array.isArray(data.routeShape) ? data.routeShape : undefined,
    // Home v2 detail fields + photo (feed-post-details.ts) — well-formed only.
    ...sanitizePostDetails(data),
    createdAt,
  };
}
