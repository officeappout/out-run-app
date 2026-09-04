'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Footprints, Zap, Timer, TrendingUp, Moon, Loader2, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import RunBriefingDrawer from '@/features/workout-engine/players/running/components/RunBriefingDrawer';
import {
  getRunWorkoutTemplate,
  getPaceMapConfig,
  getRunProgramTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import { materializeWorkout } from '@/features/workout-engine/core/services/running-engine.service';
import {
  isRunningPlanBuildStuck,
  hasRunningRebuildInputs,
  buildActiveRunningProgram,
} from '@/features/workout-engine/core/services/running-schedule-write.service';
import {
  resolveWorkoutMetadata,
  detectTimeOfDay,
  detectDayPeriod,
} from '@/features/workout-engine/services/workout-metadata.service';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';
import { resolveRunningDayState } from '@/lib/running-day-resolution';
import type RunWorkout from '@/features/workout-engine/players/running/types/run-workout.type';

const DAY_TO_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const DIST_KM: Record<string, number> = {
  '2k': 2, '3k': 3, '5k': 5, '10k': 10, maintenance: 5,
};
const DIST_LABEL: Record<string, string> = {
  '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ',
  '10k': '10 ק״מ', maintenance: '5 ק״מ',
};

type WorkoutType = 'easy' | 'interval' | 'tempo' | 'long';

const CATEGORY_TO_TYPE: Record<string, WorkoutType> = {
  easy_run: 'easy',
  recovery: 'easy',
  short_intervals: 'interval',
  long_intervals: 'interval',
  fartlek: 'interval',
  tempo: 'tempo',
  time_trial: 'tempo',
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

export default function NextRunWorkoutCard() {
  const router = useRouter();
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
  );
  const isRunDay = dayState.isRunDay;

  // ── Skip today / rest toggle ──
  const [skippedToday, setSkippedToday] = useState(false);

  // ── Briefing drawer state ──
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingWorkout, setBriefingWorkout] = useState<RunWorkout | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const briefingLoadedIdRef = useRef<string | null>(null);

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
          ? CATEGORY_TO_TYPE[targetEntry.category] ?? 'easy'
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
  useEffect(() => {
    if (!briefingOpen || !pendingWorkoutId) return;
    if (briefingLoadedIdRef.current === pendingWorkoutId) return;

    const paceProfile = running?.paceProfile;
    const programId = running?.activeProgram?.programId;
    if (!paceProfile) return;

    setBriefingLoading(true);
    const rawTemplateId = pendingWorkoutId.replace(/_w\d+$/, '');

    Promise.all([
      getRunWorkoutTemplate(rawTemplateId),
      getPaceMapConfig(),
      programId ? getRunProgramTemplate(programId) : Promise.resolve(null),
    ])
      .then(async ([template, paceMapConfig, fullProgram]) => {
        if (!template) { setBriefingLoading(false); return; }
        const rules = (fullProgram as any)?.progressionRules ?? [];
        const w = materializeWorkout(template, pendingWeek ?? 1, rules, paceProfile, paceMapConfig);

        const totalDurMin = Math.round(
          w.blocks.reduce((s, b) => s + (b.durationSeconds ?? 0), 0) / 60,
        );

        const runningCategoryLabels: Record<string, string> = {
          short_intervals: 'אינטרוולים קצרים',
          long_intervals: 'אינטרוולים ארוכים',
          fartlek_easy: 'פרטלק קל',
          fartlek_structured: 'פרטלק מובנה',
          tempo: 'טמפו',
          hill_long: 'עליות ארוכות',
          hill_short: 'עליות קצרות',
          hill_sprints: 'ספרינט עליות',
          long_run: 'ריצה ארוכה',
          easy_run: 'ריצה קלה',
          strides: 'סטריידים',
        };

        try {
          const metadata = await resolveWorkoutMetadata({
            persona: profile?.identity?.persona ?? null,
            location: 'park',
            timeOfDay: detectTimeOfDay(),
            gender: profile?.core?.gender as 'male' | 'female' | undefined,
            sportType: 'running',
            experienceLevel: paceProfile.profileType === 3 ? 'beginner' : paceProfile.profileType === 2 ? 'intermediate' : 'advanced',
            durationMinutes: totalDurMin,
            difficulty: w.isQualityWorkout ? 3 : 2,
            category: template.category,
            categoryLabel: template.category ? runningCategoryLabels[template.category] ?? template.category : undefined,
            currentProgram: programId,
            programProgress: effectiveCurrentWeek
              ? Math.round(((effectiveCurrentWeek - 1) / ((fullProgram as any)?.totalWeeks ?? 8)) * 100)
              : undefined,
            dayPeriod: detectDayPeriod(),
            runningBasePace: paceProfile.basePace,
            targetDistanceLabel: DIST_LABEL[targetDist] ?? '5 ק״מ',
            programPhase: (fullProgram as any)?.phases?.find((p: any) => {
              const week = pendingWeek ?? 1;
              return week >= p.startWeek && week <= p.endWeek;
            })?.name,
          });

          if (metadata.title) w.title = metadata.title;
          if (metadata.description) w.description = metadata.description;
          w.logicCue = metadata.logicCue ?? undefined;
          w.aiCue = metadata.aiCue ?? undefined;
          w.metadataSource = metadata.source;
        } catch {
          // Firestore metadata is best-effort — use template fallbacks
        }

        setBriefingWorkout(w);
        briefingLoadedIdRef.current = pendingWorkoutId;
        setBriefingLoading(false);
      })
      .catch(() => setBriefingLoading(false));
  }, [briefingOpen, pendingWorkoutId, running?.paceProfile, running?.activeProgram?.programId, pendingWeek, effectiveCurrentWeek]);

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
              <p className="text-sm text-slate-400 mt-0.5">
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
              <p className="text-sm text-slate-400 mt-0.5">
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
            <p className="text-sm text-slate-400 mt-0.5">
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
  const WorkoutIcon = WORKOUT_ICONS[workout];

  const effectiveRestDay = !isRunDay || skippedToday;

  if (effectiveRestDay) {
    // "Next run" preview — dayState.nextEntry/.nextEntryDaysAway already
    // account for both sources (scheduleDays weekday lookup, or the
    // program-fallback "next pending entry this week" when scheduleDays is
    // empty). daysAway is only known in the scheduleDays case; the fallback
    // has no weekday to count toward, so it gets a day-agnostic label.
    const nextRun = dayState.nextEntry;
    const nextWorkoutDisplayName = nextRun?.workoutName ?? null;

    const CATEGORY_LABELS_HE: Record<string, string> = {
      easy_run: 'ריצה קלה', long_run: 'ריצה ארוכה',
      short_intervals: 'אינטרוולים קצרים', long_intervals: 'אינטרוולים ארוכים',
      fartlek_easy: 'פארטלק קל', fartlek_structured: 'פארטלק מובנה',
      tempo: 'ריצת טמפו', hill_long: 'עליות ארוכות',
      hill_short: 'עליות קצרות', hill_sprints: 'ספרינט עליות',
      strides: 'סטריידים', recovery: 'התאוששות',
    };

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
              <p className="text-sm text-slate-400 mt-0.5">
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
        <p className="text-xs font-bold text-slate-400">האימון שלך היום</p>
        <span className="text-[11px] font-medium text-slate-400 tabular-nums">
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
            {workoutLabel || labels[workout]}
          </p>
          {estimatedMinutes && (
            <p className="text-sm text-slate-400 mt-0.5">~{estimatedMinutes} דקות</p>
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
        className="w-full mt-2 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
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
