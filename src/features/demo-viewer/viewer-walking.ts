/**
 * "לא לבד" for the demo viewer (PR 5). Pure.
 *
 * Demo groups are private by design (isPublic:false), so the public walking query never
 * returns them. The viewer reads their demo groups by id instead; here they are offered
 * as if they were the viewer's own neighbourhood groups: treated as public for the pick,
 * and measured from the viewer's demo home (the group's own meeting point) when the
 * viewer is physically elsewhere.
 */
import { isDemoTenantId } from '@/lib/demo';
import type { CommunityGroup } from '@/types/community.types';
import { pickWalkingGroupSuggestion, type WalkingGroupSuggestion } from '@/features/schedule/walking/nearbyWalkingGroup';

export function pickViewerWalkingSuggestion(
  demoGroups: readonly CommunityGroup[],
  homeCityId: string,
  pos: { lat: number; lng: number } | null,
  now: Date,
): WalkingGroupSuggestion | null {
  const mine = demoGroups
    .filter((g) => isDemoTenantId(g.id) && g.category === 'walking')
    .map((g) => ({ ...g, isPublic: true }));
  if (!mine.length) return null;
  const near = pickWalkingGroupSuggestion(mine, pos, now);
  if (near) return near;
  // Not physically near the demo city: measure from the home city's group meeting point.
  const home = mine.find((g) => g.authorityId === homeCityId) ?? mine[0];
  const at = home.meetingLocation?.location;
  if (!at || typeof at.lat !== 'number' || typeof at.lng !== 'number') return null;
  return pickWalkingGroupSuggestion(mine.filter((g) => g.authorityId === home.authorityId), { lat: at.lat, lng: at.lng }, now);
}
