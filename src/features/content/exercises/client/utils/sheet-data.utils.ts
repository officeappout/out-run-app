/**
 * sheet-data.utils — pure derivation of the display view-model for an exercise
 * detail surface.
 *
 * Extracted from ExerciseDetailSheet.tsx so it can be shared by both the sheet
 * and the new MasterExerciseView / useExerciseMasterData hook without creating
 * a circular import (the sheet renders MasterExerciseView, which consumes this).
 *
 * Zero React, zero side-effects — a single sync function of (exercise, location).
 */

import {
  Exercise,
  ExecutionMethod,
  ExternalVideo,
  findMethodForLocation,
  getLocalizedText,
  resolveTutorialForLang,
} from '../../core/exercise.types';

/**
 * Typed return shape of buildSheetData — referenced directly by
 * MasterExerciseView and useExerciseMasterData.
 */
export interface SheetData {
  name: string;
  tutorial: ExternalVideo | undefined;
  legacy: string | null;
  posterUrl: string | null;
  /** `exercise.primaryMuscle` with fallback to first `muscleGroups` entry. */
  primaryKey: string | undefined;
  secondaryKeys: string[];
  equipmentIds: string[];
  description: string;
  goal: string;
  instructions: string;
  cues: string[];
  tips: string[];
}

function pickLegacyVideoUrl(ex: Exercise): string | null {
  if (ex.media?.videoUrl) return ex.media.videoUrl;
  const methods = ex.execution_methods ?? ex.executionMethods ?? [];
  for (const m of methods) {
    if (m?.media?.mainVideoUrl) return m.media.mainVideoUrl;
  }
  return null;
}

/**
 * Collect equipment IDs for the CURRENT location context.
 *
 * When a `method` is supplied (resolved via `findMethodForLocation`) only that
 * method's gear is parsed — so the Home variant of a movement shows bodyweight
 * while the Gym variant shows its rig, instead of unioning every method's gear.
 * Exercise-level `equipment` / `requiredUserGear` are always included since they
 * apply regardless of location. With no method we fall back to scanning all
 * methods (preserves legacy behaviour).
 */
function collectEquipmentIds(ex: Exercise, method?: ExecutionMethod | null): string[] {
  const ids = new Set<string>();

  // Root-level equipment / requiredUserGear are exercise-global — only include
  // them when we are NOT scoped to a specific method (legacy fallback path).
  // When a method IS supplied we trust only that method's fields, preventing
  // gear from other location variants bleeding in.
  if (!method) {
    (ex.equipment ?? []).filter((e) => e !== 'none').forEach((e) => ids.add(e));
    (ex.requiredUserGear ?? []).forEach((id) => id && ids.add(id));
  }

  const methods = method ? [method] : (ex.execution_methods ?? ex.executionMethods ?? []);
  for (const m of methods) {
    m.gearIds?.forEach((id) => id && ids.add(id));
    m.equipmentIds?.forEach((id) => id && ids.add(id));
    if (m.gearId) ids.add(m.gearId);
    if (m.equipmentId) ids.add(m.equipmentId);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[SheetData] collectEquipmentIds method=${method?.location ?? 'none'} →`,
    Array.from(ids),
  );
  return Array.from(ids);
}

function extractString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return String(v.he ?? v.en ?? v.male ?? v.female ?? '').trim();
  }
  return '';
}

/**
 * Build the display view-model for an exercise detail surface.
 *
 * @param exercise      - The exercise document.
 * @param location      - Active location string (used when no `preResolvedMethod`).
 * @param preResolvedMethod - When supplied, used directly instead of calling
 *   `findMethodForLocation`. This is the index-driven path: the caller has
 *   already resolved `exercise.execution_methods[selectedMethodIdx]` and passes
 *   it here so two methods at the same location are never conflated.
 */
export function buildSheetData(
  exercise: Exercise,
  location: string | null,
  preResolvedMethod?: ExecutionMethod | null,
): SheetData {
  // When the caller supplies an exact method we use it directly — this is the
  // path taken by the switcher so method[0] and method[1] (both "home") stay
  // distinct. Fall back to `findMethodForLocation` for callers that only know
  // the location string (legacy code paths).
  const activeLocation = location ?? 'park';
  const method: ExecutionMethod | null =
    preResolvedMethod !== undefined ? (preResolvedMethod ?? null)
    : findMethodForLocation(exercise, activeLocation);

  // eslint-disable-next-line no-console
  console.log(
    `⚙️ [buildSheetData] exercise="${exercise.id}" location="${activeLocation}"`,
    `preResolved=${preResolvedMethod !== undefined}`,
    `resolvedMethod.location="${method?.location ?? 'none'}"`,
    `mainVideoUrl="${method?.media?.mainVideoUrl ?? '–'}"`,
  );

  // C-Fix1: method-locked tutorial — the SELECTED method, then the exercise-root shared
  // clip. Intentionally NO cross-method scan (was `?? pickFullTutorial(exercise)`), which
  // pulled PARK's fullTutorial when a home/service method has only a previewVideo.
  const tutorial: ExternalVideo | undefined =
    resolveTutorialForLang(method?.media as any, 'he') ??
    resolveTutorialForLang(exercise.media as any, 'he');

  // Legacy mainVideoUrl: prefer the matched method, fall back to full scan.
  const legacy = method?.media?.mainVideoUrl ?? pickLegacyVideoUrl(exercise);

  // Best available static poster image shown while the video buffers.
  // Priority: method image → exercise-level image → Bunny thumbnail from tutorial.
  const posterUrl: string | null =
    method?.media?.imageUrl ??
    exercise.media?.imageUrl ??
    tutorial?.thumbnailUrl ??
    null;

  const primaryKey  = exercise.primaryMuscle ?? exercise.muscleGroups?.[0];
  const secondaryKeys: string[] =
    exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0
      ? exercise.secondaryMuscles
      : (exercise.muscleGroups?.slice(1) ?? []);

  // Location-aware: only the matched method's gear for this context.
  const equipmentIds = collectEquipmentIds(exercise, method);

  const description = exercise.content?.description
    ? getLocalizedText(exercise.content.description)
    : '';
  const goal =
    !description && exercise.content?.goal ? exercise.content.goal : '';
  const instructions = exercise.content?.instructions
    ? getLocalizedText(exercise.content.instructions)
    : '';

  // Location-aware: cues/highlights are read ONLY from the method matching the
  // active location (falling back to the resolved method, then the first one).
  // This stops the "דגשים" list triplicating identical cues across the
  // home/park/gym variants of the same movement.
  const allMethods = exercise.execution_methods ?? exercise.executionMethods ?? [];
  const contextMethods = method ? [method] : allMethods.slice(0, 1);

  const cueSet = new Set<string>();
  (exercise.content?.specificCues ?? []).forEach((c) => {
    const s = extractString(c); if (s) cueSet.add(s);
  });
  contextMethods.forEach((m) => {
    ((m as any).specificCues ?? []).forEach((c: unknown) => {
      const s = extractString(c); if (s) cueSet.add(s);
    });
  });
  if (cueSet.size === 0) {
    contextMethods.forEach((m) => {
      (m.highlights ?? []).forEach((h) => {
        const s = extractString(h); if (s) cueSet.add(s);
      });
    });
  }
  const cues = Array.from(cueSet);

  const tipSet = new Set<string>();
  (exercise.content?.highlights ?? []).forEach((h) => {
    const s = extractString(h); if (s && !cueSet.has(s)) tipSet.add(s);
  });
  (exercise.content?.notes ?? []).forEach((n) => {
    const s = extractString(n); if (s && !cueSet.has(s)) tipSet.add(s);
  });
  if (cueSet.size > 0) {
    contextMethods.forEach((m) => {
      (m.highlights ?? []).forEach((h) => {
        const s = extractString(h);
        if (s && !cueSet.has(s) && !tipSet.has(s)) tipSet.add(s);
      });
    });
  }
  const tips = Array.from(tipSet);

  return {
    name: getLocalizedText(exercise.name),
    tutorial,
    legacy,
    posterUrl,
    primaryKey,
    secondaryKeys,
    equipmentIds,
    description,
    goal,
    instructions,
    cues,
    tips,
  };
}
