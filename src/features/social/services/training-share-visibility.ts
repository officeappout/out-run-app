/**
 * Who may see a "training here" share (a planned_sessions arrival) — pure, no Firebase. Used by
 * /api/training-here/partners (enable_where_to_train_v1). Reuses the feed's canSeePost, so
 * "שותפי אימון" means exactly what the feed's 'partners' means: a mutual follow (owner 26.10).
 */
import { canSeePost, isMutual, type AuthorConnections } from './feed-visibility';

export type ShareAudience = 'public' | 'partners' | 'private';

export interface ShareAccessFields {
  userId: string;
  audience?: unknown;
  privacyMode?: unknown;
  status?: unknown;
}

/**
 * The feed-style audience of a share. Docs written before `audience` existed fall back to
 * privacyMode: verified_global → public; squad / ghost / missing → private (never widened here).
 */
export function shareAudience(data: Pick<ShareAccessFields, 'audience' | 'privacyMode'>): ShareAudience {
  if (data.audience === 'public' || data.audience === 'partners' || data.audience === 'private') return data.audience;
  return data.privacyMode === 'verified_global' ? 'public' : 'private';
}

export function canSeeTrainingShare(
  data: ShareAccessFields,
  viewerUid: string,
  authorConn: AuthorConnections | null | undefined,
): boolean {
  if (data.status === 'cancelled') return false;
  return canSeePost({ authorUid: data.userId, audience: shareAudience(data) }, viewerUid, authorConn);
}

/** The viewer's own mutual follows (following ∩ followers), self excluded. */
export function mutualPartnerUids(conn: AuthorConnections | null | undefined, selfUid: string): string[] {
  if (!conn) return [];
  const followers = new Set(conn.followers ?? []);
  return Array.from(new Set((conn.following ?? []).filter((u) => followers.has(u) && u !== selfUid)));
}

/** Re-exported so callers check both directions with the same helper the feed uses. */
export { isMutual };

/** The JSON one share travels as (client-safe; times as ISO). */
export interface TrainingShareJson {
  id: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  gender: 'male' | 'female' | 'other';
  parkId?: string;
  parkName?: string;
  routeId?: string;
  routeName?: string;
  lat: number | null;
  lng: number | null;
  activityType: string;
  workoutTitle?: string;
  startTime: string;
  endTime: string | null;
  audience: ShareAudience;
}

function iso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'object' && typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate().toISOString();
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

/** Firestore planned_sessions data → TrainingShareJson (null when it has no place or no start). */
export function trainingShareJson(id: string, data: Record<string, unknown>, gender: unknown): TrainingShareJson | null {
  const startTime = iso(data.startTime);
  const parkId = str(data.parkId);
  const routeId = str(data.routeId);
  if (!startTime || (!parkId && !routeId)) return null;
  return {
    id,
    userId: String(data.userId ?? ''),
    displayName: str(data.displayName) ?? '',
    photoURL: str(data.photoURL) ?? null,
    gender: gender === 'female' || gender === 'male' ? gender : 'other',
    ...(parkId ? { parkId, parkName: str(data.parkName) ?? '' } : {}),
    ...(routeId ? { routeId, routeName: str(data.routeName) ?? '' } : {}),
    lat: typeof data.lat === 'number' ? data.lat : null,
    lng: typeof data.lng === 'number' ? data.lng : null,
    activityType: str(data.activityType) ?? 'workout',
    ...(str(data.workoutTitle) ? { workoutTitle: str(data.workoutTitle) } : {}),
    startTime,
    endTime: iso(data.endTime),
    audience: shareAudience(data),
  };
}
