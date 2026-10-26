/**
 * Partners' "training here" shares through /api/training-here/partners (Admin SDK + the feed's
 * canSeePost), so a 'partners' share only reaches the author's mutual follows. Any failure → []
 * (never a direct read that skips the check). enable_where_to_train_v1.
 */
import { auth } from '@/lib/firebase';
import type { TrainingShareJson } from './training-share-visibility';

export async function fetchPartnerTrainingShares(place?: { parkId?: string; routeId?: string }): Promise<TrainingShareJson[]> {
  try {
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    if (!idToken) return [];
    const qs = new URLSearchParams();
    if (place?.parkId) qs.set('parkId', place.parkId);
    if (place?.routeId) qs.set('routeId', place.routeId);
    const res = await fetch(`/api/training-here/partners${qs.toString() ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) throw new Error(`training-here/partners ${res.status}`);
    const body = (await res.json()) as { shares?: TrainingShareJson[] };
    return body.shares ?? [];
  } catch (err) {
    console.error('[training-shares.service] fetch failed:', err);
    return [];
  }
}
