/**
 * Everything the group page derives from the group + its next session, in
 * one pure function (no React). (Split out of GroupDetailsDrawer.tsx.)
 */
import type { CommunityGroup, ScheduleSlot } from '@/types/community.types';
import type { LeagueT } from '@/features/arena/components/league-t';
import {
  CATEGORY_CONFIG,
  buildGCalLink,
  buildStaticMapUrl,
  resolveGroupDestination,
  resolveSessionDetails,
  scheduledRunActivityOf,
  spotsLeftFor,
} from './group-details-logic';

export function deriveGroupPageView(
  group: CommunityGroup & { type?: string; plannedRun?: unknown },
  nextSlot: ScheduleSlot | null,
  nextSessionData: { date: string; time: string } | null,
  attendanceCount: number | undefined,
  mapboxToken: string,
  /** i18n (`groupDrawer.category` / `groupDrawer.calendarDetails`): the caller's `t` from `useT(community)`. */
  t: LeagueT,
) {
  const catConfig = { ...(CATEGORY_CONFIG[group.category] ?? CATEGORY_CONFIG.other), label: t('groupDrawer.category', { category: group.category ?? '' }) };
  const details = resolveSessionDetails(group, nextSlot);
  const destination = resolveGroupDestination(group, nextSlot);
  const spotsLeft = spotsLeftFor(nextSlot?.maxParticipants, attendanceCount);

  return {
    catConfig,
    ...details,
    ...destination,
    // 07.09.2026 — a persona-gated group has NO meetingLocation/scheduleSlots
    // for a viewer whose persona doesn't match; the location card then shows
    // a reason instead of nothing (so it doesn't read as the app glitching).
    isMilitaryGroup: group.groupType === 'military',
    staticMapUrl: buildStaticMapUrl(mapboxToken, destination.hasCoords, destination.destLat, destination.destLng),
    hasPrice: details.effectivePrice != null && details.effectivePrice > 0,
    spotsLeft,
    isFull: spotsLeft === 0,
    // "הוסף ליומן" — Google Calendar deep-link for the next session
    calendarUrl: nextSessionData
      ? buildGCalLink(
          group.name,
          nextSessionData.date,
          nextSessionData.time,
          destination.destAddress ?? '',
          t('groupDrawer.calendarDetails', { category: catConfig.label, groupName: group.name }),
        )
      : null,
    scheduledRunActivity: scheduledRunActivityOf(group),
  };
}
