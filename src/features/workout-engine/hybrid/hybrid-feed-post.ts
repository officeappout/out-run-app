/**
 * hybrid-feed-post — the feed post of a finished combined workout (owner,
 * 20.10.2026, all users): like a run or a strength workout, a combined
 * workout now creates a feed post, so it shows up in the individual leagues
 * (points / distance boards read feed_posts) — counted PER PART.
 *
 * It goes through the SAME writer every other workout uses
 * (feed.service createWorkoutPost): community-feed flag, the author's
 * auto-publish prefs (otherwise it's kept as a share prompt), default
 * audience, scope alignment with the author's doc, home-v2 detail stripping.
 *
 * Per part (hybrid-counting.ts → hybridPartMinutes): activityCategory is
 * 'cardio' when there was a run / walk part (distance boards get the km),
 * else 'strength'; activityCredit is computed per part from `hybridParts`
 * (feed-hybrid.ts). No run bracket (3k/5k/10k): a leg broken by stations
 * isn't one continuous effort (same rule as the records). XP stays frozen —
 * nothing here awards XP.
 *
 * buildHybridPostParams is PURE (unit-tested); publishHybridFeedPost is the
 * fire-and-forget I/O wrapper called once from useHybridRun.finishHybrid.
 */
import type { HybridPartMinutes } from './hybrid-counting';
import type { HybridPlannedSegment } from './compose-hybrid-session.service';
import type { FeedHybridParts } from '@/features/social/services/feed-hybrid';

export const HYBRID_POST_TITLE = 'אימון משולב';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface HybridPostParams {
  activityCategory: 'cardio' | 'strength';
  durationMinutes: number;
  distanceKm?: number;
  paceMinPerKm?: number;
  title: string;
  hybridParts: FeedHybridParts;
  parkId?: string;
  parkName?: string;
}

/** The single park of the done stations (park leagues), when there is exactly one. */
export function singleStationPark(
  plan: ReadonlyArray<Pick<HybridPlannedSegment, 'kind' | 'parkId'>> | null | undefined,
  names: Record<string, string>,
): { parkId: string; parkName?: string } | null {
  const ids = new Set<string>();
  for (const seg of plan ?? []) if (seg.kind === 'strength' && seg.parkId) ids.add(seg.parkId);
  if (ids.size !== 1) return null;
  const parkId = Array.from(ids)[0];
  return names[parkId] ? { parkId, parkName: names[parkId] } : { parkId };
}

/** Post params from the per-part minutes. Null when there is nothing to post. */
export function buildHybridPostParams(
  m: HybridPartMinutes,
  park: { parkId: string; parkName?: string } | null = null,
): HybridPostParams | null {
  const runKm = round2(Math.max(0, m.runKm));
  const walkKm = round2(Math.max(0, m.walkKm));
  const aerobicMin = Math.max(0, m.runMinutes) + Math.max(0, m.walkMinutes);
  const strengthMin = Math.max(0, m.strengthMinutes);
  const km = round2(runKm + walkKm);
  const total = aerobicMin + strengthMin;
  if (total <= 0 && km <= 0 && m.strengthSets <= 0) return null;
  const hasAerobic = km > 0 || aerobicMin > 0;
  return {
    activityCategory: hasAerobic ? 'cardio' : 'strength',
    durationMinutes: Math.max(total, 1),
    ...(km > 0 ? { distanceKm: km } : {}),
    ...(km > 0 && aerobicMin > 0 ? { paceMinPerKm: Number((aerobicMin / km).toFixed(2)) } : {}),
    title: HYBRID_POST_TITLE,
    hybridParts: {
      runKm,
      walkKm,
      runMinutes: Math.max(0, m.runMinutes),
      walkMinutes: Math.max(0, m.walkMinutes),
      strengthMinutes: strengthMin,
      strengthSets: Math.max(0, m.strengthSets),
    },
    ...(park ?? {}),
  };
}

/** Fire-and-forget: never throws, never blocks the finish. */
export async function publishHybridFeedPost(
  uid: string,
  m: HybridPartMinutes,
  plan: ReadonlyArray<HybridPlannedSegment> | null,
  stationNames: Record<string, string>,
): Promise<void> {
  try {
    const { IS_COMMUNITY_FEED_ENABLED } = await import('@/config/feature-flags');
    if (!IS_COMMUNITY_FEED_ENABLED) return;
    const post = buildHybridPostParams(m, singleStationPark(plan, stationNames));
    if (!post) return;
    const { useUserStore } = await import('@/features/user/identity/store/useUserStore');
    const profile = useUserStore.getState().profile;
    if (!profile?.core?.name) return;
    const { createWorkoutPost } = await import('@/features/social/services/feed.service');
    const { extractFeedScope, extractGroupIds } = await import('@/features/social/services/feed-scope.utils');
    const { streakFor } = await import('@/features/social/services/feed-post-details');
    const { useActivityStore } = await import('@/features/activity/store/useActivityStore');
    await createWorkoutPost({
      authorUid: uid,
      authorName: profile.core.name,
      ...extractFeedScope(profile),
      groupIds: extractGroupIds(profile),
      ...post,
      streakDays: streakFor(useActivityStore.getState().currentStreak),
    });
  } catch (e) {
    console.warn('[hybrid-feed-post] feed post failed', e);
  }
}
