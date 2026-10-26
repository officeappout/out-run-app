/**
 * partner-park-shares — PURE: a mutual partner's training-here share (from
 * /api/training-here/partners?parkId=) as a "מתאמנים כאן" row (enable_where_to_train_v1).
 */
import type { SessionEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import type { TrainingShareJson } from '@/features/social/services/training-share-visibility';

export function partnerShareToArrival(s: TrainingShareJson): SessionEnrichment {
  return {
    eventId: `arrival_${s.id}`,
    eventLabel: s.displayName,
    nextStartTime: s.startTime,
    currentRegistrations: 1,
    plannedCount: 1,
    avatars: [{ uid: s.userId, name: s.displayName, ...(s.photoURL ? { photoURL: s.photoURL } : {}) }],
    isPersonalArrival: true,
    partnerShare: true,
    ...(s.workoutTitle ? { workoutTitle: s.workoutTitle } : {}),
  };
}
