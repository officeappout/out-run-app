/**
 * toRowDetails — the plan exercise → what a session-list row's
 * "פרטי התרגיל" shows (enable_strength_drawer_v1). Same derivation as the live
 * card (useExerciseDerivedValues): cues from highlights, else instructions
 * (gendered via toCueList); first muscle group = primary, the rest secondary;
 * goal falls back to the description.
 */

import { toCueList } from '@/features/content/exercises/utils/cue-text.utils';
import type { ExternalVideo } from '@/features/content/exercises/core/exercise.types';

export interface RowDetailsSource {
  name: string;
  highlights?: unknown;
  instructions?: unknown;
  muscleGroups?: unknown;
  goal?: string | null;
  description?: string | null;
  equipment?: unknown;
  fullTutorial?: ExternalVideo | null;
}

export interface RowDetails {
  name: string;
  primaryMuscle: string | null;
  secondaryMuscles: string[] | undefined;
  cues: string[] | undefined;
  goal: string | null;
  equipment: string[] | undefined;
  tutorial: ExternalVideo | null;
  hasAny: boolean;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];

export function toRowDetails(ex: RowDetailsSource, gender?: string | null): RowDetails {
  const cues = Array.isArray(ex.highlights)
    ? toCueList(ex.highlights, gender)
    : Array.isArray(ex.instructions)
      ? toCueList(ex.instructions, gender)
      : [];
  const muscles = strings(ex.muscleGroups);
  const equipment = strings(ex.equipment);
  const goal = (ex.goal || ex.description || null) as string | null;
  const tutorial = ex.fullTutorial?.videoId ? ex.fullTutorial : null;
  return {
    name: ex.name,
    primaryMuscle: muscles[0] ?? null,
    secondaryMuscles: muscles.length > 1 ? muscles.slice(1) : undefined,
    cues: cues.length > 0 ? cues : undefined,
    goal,
    equipment: equipment.length > 0 ? equipment : undefined,
    tutorial,
    hasAny: muscles.length > 0 || cues.length > 0 || !!goal || equipment.length > 0 || !!tutorial,
  };
}
