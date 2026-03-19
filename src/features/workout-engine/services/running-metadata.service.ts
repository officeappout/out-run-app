/**
 * Running Metadata Bridge
 *
 * Enriches a RunWorkout with dynamic Firestore metadata (title, description,
 * logicCue, aiCue) by calling the shared scoring engine.
 *
 * The running engine (running-engine.service.ts) is pure-function / stateless,
 * so this bridge handles the async Firestore call separately.
 */

import type { RunWorkout } from '../players/running/types/run-workout.type';
import type { PaceProfile } from '../core/types/running.types';
import {
  resolveWorkoutMetadata,
  detectTimeOfDay,
  type WorkoutMetadataContext,
} from './workout-metadata.service';
import type { LifestylePersona } from '../logic/ContextualEngine';
import { resolveContentTags, type TagResolverContext } from '@/features/content/branding/core/branding.utils';

const RUN_CATEGORY_LABELS_HE: Record<string, string> = {
  short_intervals: 'אינטרוולים קצרים',
  long_intervals: 'אינטרוולים ארוכים',
  fartlek_easy: 'פארטלק קל',
  fartlek_structured: 'פארטלק מובנה',
  tempo: 'ריצת טמפו',
  hill_long: 'עליות ארוכות',
  hill_short: 'עליות קצרות',
  hill_sprints: 'ספרינט עליות',
  long_run: 'ריצה ארוכה',
  easy_run: 'ריצה קלה',
  strides: 'סטריידים',
  recovery: 'התאוששות',
};

const TARGET_DISTANCE_LABELS: Record<string, string> = {
  '2k': '2 ק"מ',
  '3k': '3 ק"מ',
  '5k': '5 ק"מ',
  '10k': '10 ק"מ',
  maintenance: 'תחזוקה',
};

export interface RunningMetadataInput {
  workout: RunWorkout;
  paceProfile: PaceProfile;
  persona?: LifestylePersona | null;
  gender?: 'male' | 'female';
  targetDistance?: string;
  programPhase?: string;
  userAge?: number;
  isAbroad?: boolean;
  recentBundleIds?: string[];
  weekNumber?: number;
  totalWeeks?: number;
}

/**
 * Enrich a RunWorkout with dynamic metadata from Firestore.
 * Mutates the workout in-place and returns it for chaining.
 */
export async function resolveRunningWorkoutMetadata(
  input: RunningMetadataInput,
): Promise<RunWorkout> {
  const { workout, paceProfile, persona, gender, targetDistance, programPhase, userAge, isAbroad, recentBundleIds, weekNumber, totalWeeks } = input;

  const category = workout.category;
  const categoryLabel = category ? (RUN_CATEGORY_LABELS_HE[category] || category) : undefined;
  const targetDistanceLabel = targetDistance ? (TARGET_DISTANCE_LABELS[targetDistance] || targetDistance) : undefined;

  const ctx: WorkoutMetadataContext = {
    persona: persona ?? null,
    location: 'park',
    timeOfDay: detectTimeOfDay(),
    gender,
    sportType: 'running',
    runningBasePace: paceProfile.basePace,
    runningCategory: category,
    targetDistanceLabel,
    programPhase,
    categoryLabel,
    category: 'running',
    userAge,
    isAbroad,
    recentBundleIds,
    weekNumber,
    totalWeeks,
  };

  try {
    const metadata = await resolveWorkoutMetadata(ctx);

    if (metadata.title) workout.title = metadata.title;
    if (metadata.description) workout.description = metadata.description;
    if (metadata.logicCue) workout.logicCue = metadata.logicCue;
    if (metadata.aiCue) workout.aiCue = metadata.aiCue;
    workout.metadataSource = metadata.source;

    // Persist winning bundleId for anti-repetition
    if (metadata.bundleId && typeof window !== 'undefined') {
      try {
        const stored = JSON.parse(localStorage.getItem('recentBundleIds') || '[]') as string[];
        const updated = [metadata.bundleId, ...stored.filter(id => id !== metadata.bundleId)].slice(0, 5);
        localStorage.setItem('recentBundleIds', JSON.stringify(updated));
      } catch { /* ignore storage errors */ }
    }

    console.log(
      `[RunningMetadata] Resolved for "${category}" (phase: ${programPhase || 'n/a'}, week: ${weekNumber ?? 'n/a'}/${totalWeeks ?? '?'}):`,
      `title="${workout.title}", source=${metadata.source}`,
    );
  } catch (err) {
    console.warn('[RunningMetadata] Resolution failed, keeping template defaults:', err);
    workout.metadataSource = 'fallback';
  }

  return workout;
}
