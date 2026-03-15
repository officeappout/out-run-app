'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Footprints, Zap, Timer, TrendingUp, Moon, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import RunBriefingDrawer from '@/features/workout-engine/players/running/components/RunBriefingDrawer';
import {
  getRunWorkoutTemplate,
  getPaceMapConfig,
  getRunProgramTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import { materializeWorkout } from '@/features/workout-engine/core/services/running-engine.service';
import {
  resolveWorkoutMetadata,
  detectTimeOfDay,
  detectDayPeriod,
} from '@/features/workout-engine/services/workout-metadata.service';
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

interface NextRunInfo {
  timeLabel: string;
  workoutName: string | null;
}

function findNextRun(
  scheduleDays: string[],
  schedule?: any[],
  currentWeek?: number,
): NextRunInfo | null {
  const todayIdx = new Date().getDay();
  const trainingDayIndices = scheduleDays
    .map((letter) => DAY_TO_HE.indexOf(letter))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  for (let offset = 1; offset <= 7; offset++) {
    const checkIdx = (todayIdx + offset) % 7;
    if (scheduleDays.includes(DAY_TO_HE[checkIdx])) {
      const timeLabel = offset === 1 ? 'מחר' : `בעוד ${offset} ימים`;

      let workoutName: string | null = null;
      if (schedule?.length && currentWeek) {
        const weekEntries = schedule.filter((e: any) => e.week === currentWeek);
        const slotIndex = trainingDayIndices.indexOf(checkIdx);
        if (slotIndex >= 0) {
          const entry = weekEntries.find((e: any) => e.day === slotIndex + 1);
          workoutName = entry?.workoutName ?? null;
        }
      }

      return { timeLabel, workoutName };
    }
  }
  return null;
}

const CARD_STYLE = { border: '0.5px solid #E0E9FF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' };

export default function NextRunWorkoutCard() {
  const router = useRouter();
  const { profile } = useUserStore();
  const running = profile?.running;

  const scheduleDays = running?.scheduleDays ?? [];
  const todayHe = DAY_TO_HE[new Date().getDay()];
  const isRunDay = scheduleDays.includes(todayHe);
  const hasActiveSchedule = !!(running?.activeProgram?.schedule as any[])?.length;

  const targetDist = running?.generatedProgramTemplate?.targetDistance ?? '5k';
  const basePace = running?.paceProfile?.basePace ?? 0;

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
    const currentWeek = running!.activeProgram!.currentWeek ?? 1;
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
      pendingWeek: running?.activeProgram?.currentWeek ?? 1,
      pendingDay: undefined as number | undefined,
    };
  }, [running?.activeProgram, hasActiveSchedule, scheduleDays]);

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
            programProgress: running?.activeProgram?.currentWeek
              ? Math.round(((running.activeProgram.currentWeek - 1) / ((fullProgram as any)?.totalWeeks ?? 8)) * 100)
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
  }, [briefingOpen, pendingWorkoutId, running?.paceProfile, running?.activeProgram?.programId, pendingWeek]);

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

  // No active program schedule → honest placeholder
  if (!hasActiveSchedule) {
    const hasTemplate = !!running?.generatedProgramTemplate;
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
    const nextRun = findNextRun(
      scheduleDays,
      running?.activeProgram?.schedule as any[],
      running?.activeProgram?.currentWeek ?? 1,
    );

    const CATEGORY_LABELS_HE: Record<string, string> = {
      easy_run: 'ריצה קלה', long_run: 'ריצה ארוכה',
      short_intervals: 'אינטרוולים קצרים', long_intervals: 'אינטרוולים ארוכים',
      fartlek_easy: 'פארטלק קל', fartlek_structured: 'פארטלק מובנה',
      tempo: 'ריצת טמפו', hill_long: 'עליות ארוכות',
      hill_short: 'עליות קצרות', hill_sprints: 'ספרינט עליות',
      strides: 'סטריידים', recovery: 'התאוששות',
    };

    const nextWorkoutDisplayName = nextRun?.workoutName
      ?? (nextRun ? null : null);

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
                {nextRun.timeLabel === 'מחר'
                  ? `מחר מחכה לך: ${nextWorkoutDisplayName || 'אימון ריצה'}`
                  : `הבא ${nextRun.timeLabel}: ${nextWorkoutDisplayName || 'אימון ריצה'}`}
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
