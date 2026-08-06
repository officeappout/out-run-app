/**
 * station-content-resolver — resolves a hybrid stop's actual CONTENT (not just gear
 * availability). Separate, swappable resolver (unassessed-domain-gate content
 * follow-up, 05.08.2026) so future modes (mixed / bodyweight-only /
 * muscle-equivalent-swap) can be added without touching dispatchStopContent's call
 * site — only the `mode` union and this file grow; callers stay untouched.
 *
 * Today only one mode is implemented: 'hydraulic-content-if-available' — when the
 * candidate carries matched hydraulic `gym_equipment` doc(s) (real description +
 * video, see gym-equipment.types.ts), build a StrengthBlockResult straight from
 * that doc's own content instead of pulling a generic Exercise from the exercises
 * catalog. Returns null (never throws) when there's no hydraulic match or the
 * matched doc(s) lack real content — the caller (dispatchStopContent) keeps its
 * existing exercise-pool logic as the safe fallback. Never a crash, never
 * mismatched content.
 *
 * DECIDED (05.08.2026, §2 of the live-content follow-up — not a gap, do not
 * re-flag): the synthetic exercise deliberately leaves `base_movement_id` and
 * `movementGroup` unset. SmartSwap (exercise-replacement.service.ts) reads
 * those to offer Variations/Alternatives and logs a warning + returns []
 * when they're missing — that is the correct, final behavior for a
 * single-machine synthetic exercise: there is no real variation family for
 * one specific hydraulic machine to link `base_movement_id` to (fabricating
 * one would be inventing data, not mapping it), and offering
 * `movementGroup`-based bodyweight Alternatives for a machine is a distinct
 * product decision, not implemented here. If that's wanted later, it's its
 * own follow-up — not a bug in this resolver.
 */

import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { Exercise, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutExercise } from '../logic/workout-generator.types';
import type { StrengthBlockResult } from '../core/pipeline/strength-block.service';
import { buildBunnyStreamUrl } from '@/lib/bunny/bunny.config';

export type StationContentMode = 'hydraulic-content-if-available';

const SECONDS_PER_REP = 3; // mirrors workout-timing's engine constant

/** Richest brand entry for a machine — prefers one with BOTH video and image. */
function bestBrand(eq: GymEquipment): { videoUrl?: string; imageUrl?: string } | undefined {
  const brands = eq.brands ?? [];
  if (brands.length === 0) return undefined;
  return (
    brands.find((b) => b.videoUrl && b.imageUrl) ??
    brands.find((b) => b.videoUrl) ??
    brands[0]
  );
}

/**
 * live-content follow-up (05.08.2026, §4): gym_equipment brand videoUrls are stored
 * as Bunny IFRAME-EMBED urls — `iframe.bunnycdn.com/embed/{libraryId}/{uuid}`, no
 * trailing slash after the uuid (confirmed live in Firestore, e.g.
 * gym_equipment/pUoSX0V6R7OHYZXhaYJy). The shared resolveExerciseMedia
 * (media-resolution.utils.ts's `_BUNNY_UUID` regex) requires the uuid sandwiched
 * between two slashes and silently fails to match this format, so the raw
 * embed-page URL leaks through as `mainVideoUrl` — a page url, not a playable
 * `<video>` src, so the live Runner never loads it. Same embed-url pattern the
 * gym_equipment detail card already parses correctly — regex mirrors
 * `extractBunnyVideoId` in EquipmentDetailDrawer.tsx:88-97 (not duplicated via
 * cross-domain import — parks and workout-engine stay independent per
 * CLAUDE.md's domain-agnostic rule — just the same proven pattern). Returns
 * undefined (unchanged raw-url fallback) when the url isn't this exact format.
 */
function resolveBunnyStreamUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  const embedMatch = rawUrl.match(/iframe\.bunnycdn\.com\/embed\/\d+\/([0-9a-f-]{36})/i);
  if (!embedMatch) return undefined;
  return buildBunnyStreamUrl(embedMatch[1]);
}

/** Synthesize a single WorkoutExercise straight from a gym_equipment doc's own content. */
function buildHydraulicExercise(eq: GymEquipment): WorkoutExercise | null {
  const brand = bestBrand(eq);
  // §4: normalize a Bunny iframe-embed url to a real playable stream url; falls back
  // to the raw brand url unchanged for every other format (YouTube, direct mp4, etc).
  const videoUrl = resolveBunnyStreamUrl(brand?.videoUrl) ?? brand?.videoUrl;
  // `description` isn't on the GymEquipment TS type today (confirmed live in Firestore
  // data, 04.08.2026 audit) — read defensively via `any`.
  const description = (eq as any).description as string | undefined;
  if (!videoUrl && !description) return null; // no real content → caller falls back

  const isTimeBased = eq.type === 'time';

  const syntheticMethod: ExecutionMethod = {
    methodName: { he: eq.name, en: eq.name },
    location: 'park',
    requiredGearType: 'fixed_equipment',
    equipmentIds: [eq.id],
    media: { mainVideoUrl: videoUrl, imageUrl: brand?.imageUrl },
  };

  const syntheticExercise: Exercise = {
    id: `gym_equipment:${eq.id}`,
    name: { he: eq.name, en: eq.name },
    type: eq.type ?? 'reps',
    loggingMode: 'reps',
    equipment: [],
    muscleGroups: eq.primaryMuscle ? [eq.primaryMuscle] : [],
    primaryMuscle: eq.primaryMuscle,
    secondaryMuscles: eq.secondaryMuscles,
    programIds: [],
    media: { videoUrl, imageUrl: brand?.imageUrl },
    content: description ? { description: { he: description, en: '' } } : {},
    stats: { views: 0 },
    // §1 (05.08.2026 follow-up): MasterExerciseView/useExerciseMasterData/
    // findMethodForLocation all resolve methods via exercise.execution_methods —
    // a synthetic exercise with no methods nested here reads as method=none
    // everywhere in the detail sheet (empty hero video, no equipment badge,
    // location="none") even though WorkoutExercise.method (below) carries the
    // real data — the live Runner path reads that field directly and was never
    // affected, only the detail-sheet path was.
    execution_methods: [syntheticMethod],
  };

  return {
    exercise: syntheticExercise,
    method: syntheticMethod as any,
    mechanicalType: 'none',
    sets: 2,
    reps: isTimeBased ? 20 : 8, // reps carries seconds when isTimeBased (engine convention)
    isTimeBased,
    restSeconds: 60,
    priority: 'compound',
    score: 0,
    reasoning: [`[station-content-resolver] hydraulic machine content: ${eq.name}`],
    exerciseRole: 'main',
  };
}

/**
 * Resolve a stop's content for the given mode. Returns null (safe fallback signal)
 * when the mode has no matching equipment or no real content to show — the caller
 * must NOT treat null as an error, just as "use the existing pool-based logic".
 */
export function resolveStationContent(
  hydraulicEquipment: GymEquipment[] | undefined,
  mode: StationContentMode,
): StrengthBlockResult | null {
  if (mode !== 'hydraulic-content-if-available') return null;
  if (!hydraulicEquipment || hydraulicEquipment.length === 0) return null;

  const exercises = hydraulicEquipment
    .map(buildHydraulicExercise)
    .filter((e): e is WorkoutExercise => e !== null)
    .slice(0, 3); // a station is one stop's content, not the whole park's machine list

  if (exercises.length === 0) return null; // matched doc(s) had no real content → safe fallback

  const estimatedDurationSec = exercises.reduce(
    (acc, ex) => acc + ex.sets * ((ex.isTimeBased ? ex.reps : ex.reps * SECONDS_PER_REP) + ex.restSeconds),
    0,
  );

  return {
    exercises,
    estimatedDurationSec,
    totalPlannedSets: exercises.reduce((acc, ex) => acc + ex.sets, 0),
    domainFocus: undefined,
    isEmpty: false,
    log: [`[station-content-resolver] ${exercises.length} hydraulic-machine exercise(s) from gym_equipment`],
  };
}
