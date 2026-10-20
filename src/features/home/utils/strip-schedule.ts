/**
 * The home week strip's data mapping (SmartWeeklySchedule props), in one pure
 * place so every screen that shows the strip — home, and the progress tab
 * under enable_home_v2 — draws the SAME week: same training days, same track,
 * same run overlay. Lifted verbatim from src/app/home/page.tsx (behaviour
 * unchanged; flag off → exactly the old values).
 */
import type { DaySchedule } from '@/features/home/data/mock-schedule-data';

export const STRIP_WEEK_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

export type StripTrack = 'wellness' | 'performance' | 'running';

export interface StripScheduleInput {
  /** profile.lifestyle.scheduleDays */
  lifestyleScheduleDays: string[];
  /** profile.running.scheduleDays */
  runningScheduleDays: string[];
  /** useDashboardMode(profile, enableRunningPrograms) */
  dashboardMode: string;
  /** enable_home_v2 */
  v2: boolean;
  hasStrengthProgram: boolean;
  /** useHomeRunSlot(...).hasRunningPlan */
  hasRunningPlan: boolean;
  /** profile.lifestyle.primaryTrack */
  primaryTrack?: string | null;
  /** 0 = Sunday. */
  todayIndex: number;
}

export interface StripSchedule {
  isRunningMode: boolean;
  /** The training days the dashboard mode uses (running days in running mode). */
  userScheduleDays: string[];
  hasSchedule: boolean;
  /** enable_home_v2: the strip of a running-only user. */
  runStripOnly: boolean;
  /** enable_home_v2: a dual-track user outside running mode — the run days on the strength strip. */
  runOverlayDays: string[] | undefined;
  /** The seven cells Sunday → Saturday. */
  schedule: DaySchedule[];
  /** SmartWeeklySchedule `currentTrack`. */
  currentTrack: StripTrack;
  /** SmartWeeklySchedule `scheduleDays`. */
  scheduleDays: string[];
}

export function resolveStripSchedule(input: StripScheduleInput): StripSchedule {
  const { lifestyleScheduleDays, runningScheduleDays, dashboardMode, v2, hasStrengthProgram, hasRunningPlan, primaryTrack, todayIndex } = input;
  const isRunningMode = dashboardMode === 'RUNNING' || dashboardMode === 'HYBRID';
  const userScheduleDays = isRunningMode && runningScheduleDays.length > 0 ? runningScheduleDays : lifestyleScheduleDays;
  const hasSchedule = userScheduleDays.length > 0;
  const runStripOnly = v2 && !hasStrengthProgram && hasRunningPlan;
  const runOverlayDays = v2 && hasStrengthProgram && hasRunningPlan && !isRunningMode ? runningScheduleDays : undefined;
  const schedule: DaySchedule[] = STRIP_WEEK_DAYS.map((day, i) => {
    const isToday = i === todayIndex;
    const isTrainingDay = userScheduleDays.includes(day);
    // Past training days are NOT auto-marked 'completed' — useDayStatus decides.
    const status: DaySchedule['status'] = isToday ? 'today' : isTrainingDay ? 'scheduled' : 'rest';
    return { day, date: i + 1, status };
  });
  const currentTrack: StripTrack = isRunningMode || runStripOnly ? 'running' : primaryTrack === 'performance' ? 'performance' : 'wellness';
  return {
    isRunningMode,
    userScheduleDays,
    hasSchedule,
    runStripOnly,
    runOverlayDays,
    schedule,
    currentTrack,
    scheduleDays: runStripOnly ? runningScheduleDays : userScheduleDays,
  };
}
