/**
 * Home's PostJoinSuccessDrawer "add to my planner" toggle (enable_group_fixes_v1).
 * The community page wired onPlannerPref; home rendered the same drawer without
 * it, so the toggle did nothing for every join that lands on home.
 */
import { addCommunitySessionsToPlanner } from '@/features/user/scheduling/services/communitySchedule.service';
import type { CommunityGroup, ScheduleSlot } from '@/types/community.types';

export function homeJoinPlannerPref(
  uid: string | undefined,
  data: { name: string; category?: string; scheduleSlots?: ScheduleSlot[]; group?: CommunityGroup | null } | null,
): (addToPlanner: boolean) => void {
  return (addToPlanner) => {
    const groupId = data?.group?.id;
    if (!addToPlanner || !uid || !groupId || !data?.scheduleSlots?.length) return;
    addCommunitySessionsToPlanner(uid, groupId, data.name, data.category ?? 'other', data.scheduleSlots)
      .catch((err) => console.warn('[Home] planner sync failed:', err));
  };
}
