/**
 * training-share-item.logic — PURE: how one partner share reads in the feed (enable_where_to_train_v1).
 */
import type { TrainingShareJson } from '@/features/social/services/training-share-visibility';
import type { TrainingHerePlace } from '@/features/parks/client/components/training-here/training-here.logic';
import { NOW_GRACE_MIN } from '@/features/parks/client/components/training-here/training-here.logic';

/** "now" while it has started (or starts within NOW_GRACE_MIN), else "later". */
export function shareTiming(share: Pick<TrainingShareJson, 'startTime'>, now: Date): 'now' | 'later' {
  return new Date(share.startTime).getTime() <= now.getTime() + NOW_GRACE_MIN * 60_000 ? 'now' : 'later';
}

export function sharePlace(share: TrainingShareJson): TrainingHerePlace {
  return share.parkId
    ? { kind: 'park', id: share.parkId, name: share.parkName ?? '', lat: share.lat, lng: share.lng }
    : { kind: 'route', id: share.routeId ?? '', name: share.routeName ?? '', lat: share.lat, lng: share.lng };
}
