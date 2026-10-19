'use client';

/**
 * Loads + materializes one planned run of the user's running program (the
 * template, the pace map and the program — three single-doc reads, once per
 * workout id) and resolves its copy. Extracted verbatim from
 * NextRunWorkoutCard so the home carousel's run card (enable_home_v2) uses
 * the exact same loader instead of a second copy. `enabled` = load now;
 * a loaded workout is kept until the workout id changes.
 */

import { useEffect, useRef, useState } from 'react';
import {
  getRunWorkoutTemplate,
  getPaceMapConfig,
  getRunProgramTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import { materializeWorkout, computeZones } from '@/features/workout-engine/core/services/running-engine.service';
import { calmRunWorkout, calmCopy, type CalmReturnState } from '@/lib/calm-return';
import {
  resolveWorkoutMetadata,
  detectTimeOfDay,
  detectDayPeriod,
  resolveRunningContentSituation,
} from '@/features/workout-engine/services/workout-metadata.service';
import type { WeatherFlag } from '@/features/weather/core/weather.types';
import type RunWorkout from '@/features/workout-engine/players/running/types/run-workout.type';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

type MetadataPersona = Parameters<typeof resolveWorkoutMetadata>[0]['persona'];

const DIST_LABEL: Record<string, string> = {
  '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ',
  '10k': '10 ק״מ', maintenance: '5 ק״מ',
};

const RUNNING_CATEGORY_LABELS: Record<string, string> = {
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

export interface UsePlannedRunWorkoutArgs {
  enabled: boolean;
  profile: UserFullProfile | null | undefined;
  workoutId: string | undefined;
  /** The entry's program week (materialization week). */
  week: number | undefined;
  /** The program's current week (copy: programme progress). */
  currentWeek: number | undefined;
  weatherFlag?: WeatherFlag | null;
  /** Calm return's lighter load, or null. */
  calmLoad: CalmReturnState['load'] | null;
}

export function usePlannedRunWorkout({
  enabled, profile, workoutId, week, currentWeek, weatherFlag = null, calmLoad,
}: UsePlannedRunWorkoutArgs): { workout: RunWorkout | null; loading: boolean } {
  const running = profile?.running;
  const targetDist = running?.generatedProgramTemplate?.targetDistance ?? '5k';
  const [workout, setWorkout] = useState<RunWorkout | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !workoutId) return;
    if (loadedIdRef.current === workoutId) return;

    const paceProfile = running?.paceProfile;
    const programId = running?.activeProgram?.programId;
    if (!paceProfile) return;

    setLoading(true);
    const rawTemplateId = workoutId.replace(/_w\d+$/, '');

    Promise.all([
      getRunWorkoutTemplate(rawTemplateId),
      getPaceMapConfig(),
      programId ? getRunProgramTemplate(programId) : Promise.resolve(null),
    ])
      .then(async ([template, paceMapConfig, fullProgram]) => {
        if (!template) { setLoading(false); return; }
        const rules = (fullProgram as any)?.progressionRules ?? [];
        const materialized = materializeWorkout(template, week ?? 1, rules, paceProfile, paceMapConfig);
        const w = calmLoad
          ? calmRunWorkout(materialized, calmLoad, {
              easyPace: paceProfile.basePace > 0
                ? (({ minPace, maxPace }) => ({ min: minPace, max: maxPace }))(
                    computeZones(paceProfile.basePace, paceProfile.profileType, paceMapConfig).easy,
                  )
                : null,
              easyLabel: calmCopy(null).easyRunLabel,
            })
          : materialized;

        const totalDurMin = Math.round(
          w.blocks.reduce((s, b) => s + (b.durationSeconds ?? 0), 0) / 60,
        );

        try {
          const metadata = await resolveWorkoutMetadata({
            // `identity` isn't on the store's profile type (same read the card always did).
            persona: (profile as { identity?: { persona?: MetadataPersona | null } } | null | undefined)?.identity?.persona ?? null,
            location: 'park',
            timeOfDay: detectTimeOfDay(),
            gender: profile?.core?.gender as 'male' | 'female' | undefined,
            sportType: 'running',
            experienceLevel: paceProfile.profileType === 3 ? 'beginner' : paceProfile.profileType === 2 ? 'intermediate' : 'advanced',
            durationMinutes: totalDurMin,
            difficulty: w.isQualityWorkout ? 3 : 2,
            category: template.category,
            categoryLabel: template.category ? RUNNING_CATEGORY_LABELS[template.category] ?? template.category : undefined,
            currentProgram: programId,
            programProgress: currentWeek
              ? Math.round(((currentWeek - 1) / ((fullProgram as any)?.totalWeeks ?? 8)) * 100)
              : undefined,
            dayPeriod: detectDayPeriod(),
            runningBasePace: paceProfile.basePace,
            targetDistanceLabel: DIST_LABEL[targetDist] ?? '5 ק״מ',
            programPhase: (fullProgram as any)?.phases?.find((p: any) => {
              const wk = week ?? 1;
              return wk >= p.startWeek && wk <= p.endWeek;
            })?.name,
            // Copy "moments": 7+ days since the last run → 'returning' rows; weather rows
            // only for the flagged weather.
            situation: resolveRunningContentSituation(running?.lastWorkoutDate),
            weather: weatherFlag ?? undefined,
          });

          if (metadata.title) w.title = metadata.title;
          if (metadata.description) w.description = metadata.description;
          w.logicCue = metadata.logicCue ?? undefined;
          w.aiCue = metadata.aiCue ?? undefined;
          w.metadataSource = metadata.source;
        } catch {
          // Firestore metadata is best-effort — use template fallbacks
        }

        setWorkout(w);
        loadedIdRef.current = workoutId;
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // Same dependency list the card's inline effect had (profile copy fields read at load time).
  }, [enabled, workoutId, running?.paceProfile, running?.activeProgram?.programId, week, currentWeek, running?.lastWorkoutDate, weatherFlag, calmLoad]);

  return { workout, loading };
}
