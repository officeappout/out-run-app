'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Footprints, Zap, Timer, TrendingUp, Moon, Loader2, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import RunBriefingDrawer from '@/features/workout-engine/players/running/components/RunBriefingDrawer';
import { calmCopy, type CalmReturnState } from '@/lib/calm-return';
import { usePlannedRunWorkout } from '@/features/home/hooks/usePlannedRunWorkout';
import {
  isRunningPlanBuildStuck,
  hasRunningRebuildInputs,
  buildActiveRunningProgram,
} from '@/features/workout-engine/core/services/running-schedule-write.service';
import type { WeatherFlag } from '@/features/weather/core/weather.types';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';
import { resolveRunningDayState } from '@/lib/running-day-resolution';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import RunWeekListV2 from './run-week-v2/RunWeekListV2';
import RunOverviewHomeSheet from '@/features/workout-engine/players/running/components/overview-v2/RunOverviewHomeSheet';
import { plannedRunMapUrl } from '@/features/workout-engine/players/running/utils/run-overview/run-overview-url';
import type { RunEdits } from '@/features/workout-engine/players/running/utils/run-overview/run-edits';

const DAY_TO_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const DIST_KM: Record<string, number> = {
  '2k': 2, '3k': 3, '5k': 5, '10k': 10, maintenance: 5,
};
const DIST_LABEL: Record<string, string> = {
  '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ',
  '10k': '10 ק״מ', maintenance: '5 ק״מ',
};

type WorkoutType = 'easy' | 'interval' | 'tempo' | 'long';

/**
 * Which of the 4 icon-family buckets each real WorkoutCategory falls into.
 * Fixed 05.09.2026 — the old version was `Record<string, WorkoutType>`
 * (uncompiled-checked, so nothing forced it to cover every real category),
 * only mapped 5 of the 11 real WorkoutCategory values, included 2 keys that
 * never existed anywhere else in the codebase ('fartlek', 'time_trial'),
 * and silently fell every uncovered real category (fartlek_easy,
 * fartlek_structured, hill_long, hill_short, hill_sprints, strides) to
 * 'easy' via `?? 'easy'` at the one call site — a runner on a hill workout
 * saw the easy-run icon with no indication anything was wrong.
 *
 * `Record<WorkoutCategory, WorkoutType>` forces compiler-checked coverage
 * of exactly the 11 real categories. Deliberately stays within the
 * existing 4-icon vocabulary (Footprints/Zap/Timer/TrendingUp) rather than
 * adding new icons for each of the 11 — that would be a real UI/design
 * decision, not a bug fix. Buckets chosen by effort shape, not by name:
 * fartlek_easy → easy (explicitly the easy variant); fartlek_structured →
 * interval (alternating hard/easy, same shape as short/long intervals);
 * hill_long → tempo (sustained hard effort, not short bursts); hill_short/
 * hill_sprints → interval (repeat-based, same shape as short_intervals);
 * strides → easy (a light addition tacked onto an easy run, not a workout
 * in its own right).
 */
const CATEGORY_TO_TYPE: Record<WorkoutCategory, WorkoutType> = {
  easy_run: 'easy',
  strides: 'easy',
  fartlek_easy: 'easy',
  short_intervals: 'interval',
  long_intervals: 'interval',
  fartlek_structured: 'interval',
  hill_short: 'interval',
  hill_sprints: 'interval',
  tempo: 'tempo',
  hill_long: 'tempo',
  long_run: 'long',
};

const WORKOUT_ICONS: Record<WorkoutType, React.FC<{ size?: number; className?: string }>> = {
  easy: Footprints,
  interval: Zap,
  tempo: Timer,
  long: TrendingUp,
};

function formatDate(): string {
  const d = new Date();
  const day = DAY_TO_HE[d.getDay()] ?? '';
  return `יום ${day}׳, ${d.getDate()}/${d.getMonth() + 1}`;
}

const CARD_STYLE = { border: '0.5px solid #E0E9FF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

interface NextRunWorkoutCardProps {
  /** Weather flag at the user's cell (home's useWeather, `weather_enabled`); null/undefined = none. */
  weatherFlag?: WeatherFlag | null;
  /** Calm return (CALM_RETURN_V1) — null/undefined whenever the flag is off = today's card. */
  calmReturn?: CalmReturnState | null;
  /** 4–6 days away: only the card's title line changes. */
  calmWelcomeBack?: boolean;
}

export default function NextRunWorkoutCard({ weatherFlag = null, calmReturn = null, calmWelcomeBack = false }: NextRunWorkoutCardProps = {}) {
  // Calm return: quality runs show (and run) as an easy run, with the tier's lighter volume.
  const calmLoad = calmReturn?.isLightened ? calmReturn.load : null;
  const router = useRouter();
  // Home v2 (enable_home_v2): the week list (board R1-prop-types) + the v2 briefing.
  const v2 = useHomeV2();
  const { profile, _hasHydrated, refreshProfile } = useUserStore();
  const running = profile?.running;

  // ── Rebuild-stuck plan (A2, idempotent-booping-sunrise.md 01.09.2026) ──
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [rebuildFailedOnce, setRebuildFailedOnce] = useState(false);

  const handleRebuildClick = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || isRebuilding) return;
    setIsRebuilding(true);
    const result = await buildActiveRunningProgram(uid);
    if (result.ok) {
      await refreshProfile();
    } else {
      setRebuildFailedOnce(true);
    }
    setIsRebuilding(false);
  };

  const scheduleDays = running?.scheduleDays ?? [];
  const hasActiveSchedule = !!(running?.activeProgram?.schedule as any[])?.length;

  const targetDist = running?.generatedProgramTemplate?.targetDistance ?? '5k';
  const basePace = running?.paceProfile?.basePace ?? 0;

  // Canonical current-week resolution (flag-gated recompute; falls back to
  // the stored field exactly as today while RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED
  // is false). Computed once here and reused at every read site below instead
  // of re-reading the (possibly stale) stored field independently at each one.
  const effectiveCurrentWeek = resolveRunningCurrentWeek(
    running?.activeProgram?.startDate,
    running?.activeProgram?.currentWeek,
  );

  // "Is today a run day" — scheduleDays governs when set (unchanged
  // behavior). When it's empty but a real program exists for this week,
  // the program is the source of truth instead of a permanent "rest day"
  // (04.09.2026 fix — see src/lib/running-day-resolution.ts's own doc
  // comment for the bug this closes).
  const dayState = resolveRunningDayState(
    scheduleDays,
    running?.activeProgram?.schedule as any[] | undefined,
    effectiveCurrentWeek ?? 1,
    new Date(),
    running?.activeProgram?.startDate,
  );
  const isRunDay = dayState.isRunDay;

  // ── Skip today / rest toggle ──
  const [skippedToday, setSkippedToday] = useState(false);

  // ── Briefing drawer state ──
  const [briefingOpen, setBriefingOpen] = useState(false);

  const { workout, workoutLabel, pendingWorkoutId, pendingWeek, pendingDay } = useMemo(() => {
    if (!hasActiveSchedule) {
      return {
        workout: 'easy' as WorkoutType,
        workoutLabel: undefined as string | undefined,
        pendingWorkoutId: undefined as string | undefined,
        pendingWeek: undefined as number | undefined,
        pendingDay: undefined as number | undefined,
      };
    }

    const schedule = running!.activeProgram!.schedule as any[];
    const currentWeek = effectiveCurrentWeek ?? 1;
    const weekEntries = schedule.filter((s: any) => s.week === currentWeek);

    if (weekEntries.length > 0) {
      const trainingDayIndices = scheduleDays
        .map((letter) => DAY_TO_HE.indexOf(letter))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);

      const todayIdx = new Date().getDay();

      let todayEntry: any | undefined;
      for (const entry of weekEntries) {
        const slotIndex = entry.day - 1;
        const dayIdx = trainingDayIndices[slotIndex];
        if (dayIdx === todayIdx) {
          todayEntry = entry;
          break;
        }
      }

      const targetEntry = todayEntry
        ?? weekEntries.find((s: any) => s.status === 'pending' || !s.status)
        ?? weekEntries[0];

      if (targetEntry) {
        const resolved: WorkoutType = targetEntry.category
          ? CATEGORY_TO_TYPE[targetEntry.category as keyof typeof CATEGORY_TO_TYPE] ?? 'easy'
          : 'easy';
        return {
          workout: resolved,
          workoutLabel: targetEntry.workoutName as string | undefined,
          pendingWorkoutId: targetEntry.workoutId as string | undefined,
          pendingWeek: targetEntry.week as number,
          pendingDay: targetEntry.day as number,
        };
      }
    }

    return {
      workout: 'easy' as WorkoutType,
      workoutLabel: undefined as string | undefined,
      pendingWorkoutId: undefined as string | undefined,
      pendingWeek: effectiveCurrentWeek ?? 1,
      pendingDay: undefined as number | undefined,
    };
  }, [running?.activeProgram, hasActiveSchedule, scheduleDays, effectiveCurrentWeek]);

  // ── Load full workout when briefing drawer opens ──
  // v2 loads today's workout up front (its card shows the strip + numbers);
  // flag off → only when the drawer opens, as before. Same single load either way.
  // The loader itself lives in usePlannedRunWorkout (shared with the home carousel's run card).
  const preloadToday = v2 && isRunDay && !skippedToday;
  const { workout: briefingWorkout, loading: briefingLoading } = usePlannedRunWorkout({
    enabled: briefingOpen || preloadToday,
    profile,
    workoutId: pendingWorkoutId,
    week: pendingWeek,
    currentWeek: effectiveCurrentWeek ?? undefined,
    weatherFlag,
    calmLoad,
  });

  const handleBriefingGo = () => {
    setBriefingOpen(false);
    const params = new URLSearchParams();
    if (pendingWorkoutId) params.set('workoutId', pendingWorkoutId);
    if (pendingWeek) params.set('week', String(pendingWeek));
    if (pendingDay != null) params.set('day', String(pendingDay));
    params.set('context', 'running');
    params.set('autoStart', 'true');
    router.push(`/map?${params.toString()}`);
  };

  // v2 overview (boards M-6a, M-7*): start from here with the runner's edits (level, swapped
  // main set, paces), or open the map's route suggestions.
  const goToMapV2 = (edits: RunEdits, suggest: boolean) => {
    setBriefingOpen(false);
    router.push(plannedRunMapUrl({
      workoutId: pendingWorkoutId, week: pendingWeek, day: pendingDay, autoStart: !suggest, suggest, edits,
    }));
  };

  // Not hydrated yet — render nothing but a neutral skeleton. Both
  // hasActiveSchedule (false while profile is null) and
  // isRunningPlanBuildStuck (which we gate below on _hasHydrated
  // specifically) would otherwise make a claim about running-plan state
  // using data that hasn't loaded yet — the exact flicker David flagged
  // (01.09.2026 review): every valid runner would flash "we couldn't
  // build your plan" / "no running plan" for a moment on every app open.
  if (!_hasHydrated) {
    return (
      <div className="bg-white dark:bg-[#1E2A28] rounded-2xl p-5" style={CARD_STYLE} dir="rtl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gray-200 dark:bg-zinc-700 animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-32 rounded bg-gray-200 dark:bg-zinc-700 animate-pulse" />
            <div className="h-3 w-24 rounded bg-gray-100 dark:bg-zinc-800 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // No active program schedule → honest placeholder / rebuild flow.
  // isRunningPlanBuildStuck is the DERIVED signal (isUnlocked && no
  // activeProgram) — only valid to read now that _hasHydrated is
  // confirmed true, above.
  if (!hasActiveSchedule) {
    const hasTemplate = !!running?.generatedProgramTemplate;
    const isStuck = isRunningPlanBuildStuck(profile);
    const canRebuild = hasRunningRebuildInputs(profile);

    // State A — stuck, but everything needed to rebuild is already there.
    if (isStuck && canRebuild) {
      return (
        <div className="bg-white dark:bg-[#1E2A28] rounded-2xl p-5" style={CARD_STYLE} dir="rtl">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,186,247,0.08)' }}
            >
              {isRebuilding
                ? <Loader2 size={22} style={{ color: '#00BAF7' }} className="animate-spin" />
                : <AlertCircle size={22} style={{ color: '#00BAF7' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-extrabold text-slate-900 dark:text-white">
                {rebuildFailedOnce ? 'עדיין לא מצליח.' : 'לא הצלחנו להכין את תוכנית הריצה שלך.'}
              </p>
              <p className="text-sm text-slate-600 mt-0.5">
                {rebuildFailedOnce
                  ? 'בדוק את החיבור לאינטרנט ונסה שוב.'
                  : 'כל מה שמילאת שמור. לחיצה אחת ונבנה אותה.'}
              </p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleRebuildClick}
            disabled={isRebuilding}
            className="w-full mt-3 py-3 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-60"
            style={{ background: '#00BAF7' }}
          >
            {isRebuilding ? 'בונה...' : rebuildFailedOnce ? 'נסה שוב' : 'בנה את התוכנית'}
          </motion.button>
        </div>
      );
    }

    // State B — stuck, but the profile itself is missing what a rebuild
    // needs (paceProfile/generatedProgramTemplate). NOT a variant of
    // "try again" — a retry would fail identically forever here.
    //
    // ⚠️ Message-only, deliberately NO button (David, 01.09.2026 review).
    // The natural button destination, /onboarding-new/dynamic, was
    // investigated and found UNSAFE for this specific use (read-only
    // audit, not applied here — see idempotent-booping-sunrise.md's A2
    // section for full citations):
    // - isJitEdit (the guard built for exactly this class of bug, commit
    //   94b7b94f) never fires on this route — onboarding-sync.service.ts's
    //   only isJitEdit:true call site is OnboardingWizard.tsx:273's
    //   single-field JIT save, not this route.
    // - onboarding-sync.service.ts:1781-1786 unconditionally overwrites
    //   running.activeProgram to a fresh Week 1, and :1848-1853
    //   unconditionally forces lifestyle.primaryTrack/dashboardMode to
    //   'run' — neither checks whether the user already had healthy
    //   progress worth preserving. Correct behavior for a genuinely
    //   corrupted profile, but indistinguishable in code from clobbering
    //   a hybrid user's real strength-primary track or in-progress
    //   running program.
    // - The one existing test naming this exact re-entry scenario
    //   (onboarding-sync.service.test.ts's "closes doors not yet born")
    //   stubs an EMPTY running-answers payload, so the overwrite path
    //   never actually executes in that test — zero real coverage of
    //   "user genuinely answers the whole flow again."
    // No live code path is known to produce State B today (paceProfile/
    // generatedProgramTemplate are written together with isUnlocked by
    // their only writer — see running-schedule-write.service.ts's module
    // doc) — a dead end with an honest message is safer than a button
    // into a route with a documented overwrite history, for a state this
    // theoretical. Revisit once/if the overwrite guard gap above is
    // closed (mirroring the existing alreadyHasProgram/alreadyHasPrimaryTrack
    // pattern already used elsewhere in onboarding-sync.service.ts).
    if (isStuck && !canRebuild) {
      return (
        <div className="bg-white dark:bg-[#1E2A28] rounded-2xl p-5" style={CARD_STYLE} dir="rtl">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,186,247,0.08)' }}
            >
              <AlertCircle size={22} style={{ color: '#00BAF7' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-extrabold text-slate-900 dark:text-white">
                משהו חסר בהגדרת הריצה שלך.
              </p>
              <p className="text-sm text-slate-600 mt-0.5">
                נעבור שוב על ההגדרה — זה ייקח דקה.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white dark:bg-[#1E2A28] rounded-2xl p-5" style={CARD_STYLE} dir="rtl">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,186,247,0.08)' }}
          >
            {hasTemplate
              ? <Loader2 size={22} style={{ color: '#00BAF7' }} className="animate-spin" />
              : <Footprints size={22} style={{ color: '#00BAF7' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-extrabold text-slate-900 dark:text-white">
              {hasTemplate ? 'התוכנית שלך בהכנה' : 'אין תוכנית ריצה'}
            </p>
            <p className="text-sm text-slate-600 mt-0.5">
              {hasTemplate
                ? 'לוח האימונים ייווצר בכניסה הבאה'
                : 'השלם/י את ההרשמה כדי ליצור תוכנית'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const distKm = DIST_KM[targetDist] ?? 5;
  const distLabel = DIST_LABEL[targetDist] ?? '5 ק״מ';

  const labels: Record<WorkoutType, string> = {
    easy: `ריצה קלה — ${distLabel}`,
    interval: 'אינטרוולים קצרים',
    tempo: 'ריצת טמפו',
    long: 'ריצה ארוכה',
  };

  const estimatedMinutes = basePace > 0 ? Math.round((basePace * distKm) / 60) : null;
  // Calm return: an easy run replaces a quality run — the card says so before it starts.
  const calmEasy = !!calmLoad?.runEasyOnly && workout !== 'easy' && workout !== 'long';
  const displayWorkout: WorkoutType = calmEasy ? 'easy' : workout;
  const WorkoutIcon = WORKOUT_ICONS[displayWorkout];

  const effectiveRestDay = !isRunDay || skippedToday;

  if (v2) {
    const welcome = calmCopy(null);
    return (
      <>
        <RunWeekListV2
          schedule={running?.activeProgram?.schedule as any[] | undefined}
          week={pendingWeek ?? effectiveCurrentWeek ?? 1}
          totalWeeks={running?.generatedProgramTemplate?.canonicalWeeks}
          programLabel={calmWelcomeBack ? `${welcome.welcomeBackTitle} · ${welcome.welcomeBackSubtitle}` : `תוכנית ${distLabel}`}
          scheduleDays={scheduleDays}
          targetDay={pendingDay}
          isRunDay={!effectiveRestDay}
          todayWorkout={briefingWorkout}
          onStartToday={() => setBriefingOpen(true)}
          onSkipToday={() => setSkippedToday(true)}
          onUndoSkip={skippedToday ? () => setSkippedToday(false) : undefined}
        />
        <RunOverviewHomeSheet
          isOpen={briefingOpen}
          onClose={() => setBriefingOpen(false)}
          onGo={(edits) => goToMapV2(edits, false)}
          onSuggestRoute={(edits) => goToMapV2(edits, true)}
          workout={briefingWorkout}
          isLoading={briefingLoading}
          week={pendingWeek ? { week: pendingWeek, day: pendingDay, totalWeeks: running?.generatedProgramTemplate?.canonicalWeeks } : null}
        />
      </>
    );
  }

  if (effectiveRestDay) {
    // "Next run" preview — dayState.nextEntry/.nextEntryDaysAway already
    // account for both sources (scheduleDays weekday lookup, or the
    // program-fallback "next pending entry this week" when scheduleDays is
    // empty). daysAway is only known in the scheduleDays case; the fallback
    // has no weekday to count toward, so it gets a day-agnostic label.
    const nextRun = dayState.nextEntry;
    const nextWorkoutDisplayName = nextRun?.workoutName ?? null;

    return (
      <div className="bg-white dark:bg-[#1E2A28] rounded-2xl p-5" style={CARD_STYLE} dir="rtl">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(0,186,247,0.08)' }}
          >
            <Moon size={22} style={{ color: '#00BAF7' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-extrabold text-slate-900 dark:text-white">
              היום זה להתאושש 🧘
            </p>
            {nextRun && (
              <p className="text-sm text-slate-600 mt-0.5">
                {dayState.nextEntryDaysAway === 1
                  ? `מחר מחכה לך: ${nextWorkoutDisplayName || 'אימון ריצה'}`
                  : dayState.nextEntryDaysAway != null
                  ? `בעוד ${dayState.nextEntryDaysAway} ימים: ${nextWorkoutDisplayName || 'אימון ריצה'}`
                  : `הבא בתור: ${nextWorkoutDisplayName || 'אימון ריצה'}`}
              </p>
            )}
          </div>
        </div>
        {skippedToday && (
          <button
            onClick={() => setSkippedToday(false)}
            className="mt-3 text-xs font-bold text-cyan-500 hover:underline"
          >
            ביטול — אני בכל זאת רוצה להתאמן
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1E2A28] rounded-2xl p-5" style={CARD_STYLE} dir="rtl">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-bold text-slate-600">
          {calmWelcomeBack
            ? `${calmCopy(null).welcomeBackTitle} · ${calmCopy(null).welcomeBackSubtitle}`
            : 'האימון שלך היום'}
        </p>
        <span className="text-[11px] font-medium text-slate-600 tabular-nums">
          {formatDate()}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-3 mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(0,186,247,0.1)' }}
        >
          <WorkoutIcon size={22} style={{ color: '#00BAF7' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-extrabold text-slate-900 dark:text-white truncate">
            {calmEasy ? labels.easy : workoutLabel || labels[workout]}
          </p>
          {estimatedMinutes && (
            <p className="text-sm text-slate-600 mt-0.5">~{estimatedMinutes} דקות</p>
          )}
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setBriefingOpen(true)}
        className="w-full py-3.5 rounded-xl text-base font-bold text-white transition-colors"
        style={{ background: '#00BAF7', boxShadow: '0 4px 14px rgba(0,186,247,0.3)' }}
      >
        התחל ריצה
      </motion.button>

      <button
        onClick={() => setSkippedToday(true)}
        className="w-full mt-2 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
      >
        אין לי כוח היום — דלג לעוד
      </button>

      <RunBriefingDrawer
        isOpen={briefingOpen}
        onClose={() => setBriefingOpen(false)}
        onGo={handleBriefingGo}
        workout={briefingWorkout}
        isLoading={briefingLoading}
      />
    </div>
  );
}
