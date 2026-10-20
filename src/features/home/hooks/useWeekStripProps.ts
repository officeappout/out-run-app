'use client';

/**
 * enable_home_v2 — the props of the home week strip (SmartWeeklySchedule) for
 * another screen that shows the same strip (the progress tab). Same inputs
 * home uses, same pure mapping (utils/strip-schedule.ts), so the two strips
 * can't drift: same days, same track, same run overlay, same icons.
 * Profile-only — no reads here (the strip's own hooks read what home reads).
 */
import { useMemo } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { hasAssessedStrengthDomain } from '@/features/user/identity/services/access-control.service';
import { runPlacementOf } from '@/features/schedule/utils/runWeekByType';
import { getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';
import { useHomeRunSlot } from './useHomeRunSlot';
import { resolveStripSchedule } from '../utils/strip-schedule';

export function useWeekStripProps() {
  const profile = useUserStore((s) => s.profile);
  const isSuperAdmin = !!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
  const { flags } = useFeatureFlags(isSuperAdmin);
  const dashboardMode = useDashboardMode(profile, flags.enableRunningPrograms);
  const hasStrengthProgram = hasAssessedStrengthDomain(profile as never);
  const homeRun = useHomeRunSlot(profile, true, hasStrengthProgram, flags.enableHomeV2);
  const runPlacement = useMemo(() => runPlacementOf(profile?.running), [profile?.running]);

  // Same priority as home: today's recurring-template program, else the first active program.
  const programIconKey = useMemo(() => {
    const todayTemplateId = profile?.lifestyle?.recurringTemplate?.[getHebrewDayLetter(new Date())]?.[0] ?? null;
    return todayTemplateId ?? profile?.progression?.activePrograms?.[0]?.templateId;
  }, [profile?.lifestyle?.recurringTemplate, profile?.progression?.activePrograms]);

  const strip = resolveStripSchedule({
    lifestyleScheduleDays: (profile?.lifestyle?.scheduleDays as string[]) || [],
    runningScheduleDays: (profile?.running?.scheduleDays as string[]) ?? [],
    dashboardMode,
    v2: flags.enableHomeV2,
    hasStrengthProgram,
    hasRunningPlan: homeRun.hasRunningPlan,
    primaryTrack: (profile?.lifestyle as { primaryTrack?: string } | undefined)?.primaryTrack,
    todayIndex: new Date().getDay(),
  });

  const active = profile?.running?.activeProgram;
  return {
    props: {
      v2: flags.enableHomeV2,
      schedule: strip.schedule,
      currentTrack: strip.currentTrack,
      scheduleDays: strip.scheduleDays,
      programIconKey,
      userId: profile?.id,
      recurringTemplate: profile?.lifestyle?.recurringTemplate,
      runningSchedule: active?.schedule as never,
      runOverlayDays: strip.runOverlayDays,
      runPlacement,
      runningCurrentWeek: active?.currentWeek,
      runningProgramStartDate: active?.startDate as never,
      runningBasePace: profile?.running?.paceProfile?.basePace,
      runningProgramId: active?.programId,
      hasCompletedAssessment: hasStrengthProgram || strip.runStripOnly,
    },
  };
}
