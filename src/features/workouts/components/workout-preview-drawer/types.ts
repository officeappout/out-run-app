/**
 * Shared TypeScript interfaces for the WorkoutPreviewDrawer module.
 *
 * Extracted from the monolithic `WorkoutPreviewDrawer.tsx` during the
 * Phase 1 refactor.  Every sibling file imports its types from here so
 * the module has a single source of truth and no circular dependencies.
 */
import type {
  GeneratedWorkout,
  WorkoutExercise as EngineWorkoutExercise,
} from '@/features/workout-engine/logic/WorkoutGenerator';
import type { DifficultyValue } from '@/features/workout-engine/components/DifficultyBolts';

// ── Drawer Display Models ────────────────────────────────────────────────

export interface WorkoutSegment {
  id: string;
  type: 'running' | 'strength';
  title: string;
  durationOrDistance?: string;
  pace?: string;
  statusColor?: string;
  repsOrDuration?: string;
  imageUrl?: string | null;
  tags?: string[];
  /** Whether this exercise was selected because of user-owned equipment */
  matchesUserEquipment?: boolean;
}

export interface WorkoutData {
  id: string;
  title: string;
  description?: string;
  level?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  duration?: number;
  coverImage?: string;
  routePath?: number[][] | Array<{ lat: number; lng: number }>;
  segments: WorkoutSegment[];
}

// ── Intensity Toggle Row (Part א, "ארכיטקטורת הבית ומנוע-ההמלצות" doc, 21.08.2026) ──

/**
 * One trio option's display data for the inline intensity toggle row.
 * Structurally mirrors StatsOverview's own `TrioOptionSummary` — defined
 * locally here (not imported) to keep this module domain-agnostic per
 * CLAUDE.md's cross-domain import rule (home and workouts stay decoupled,
 * they just happen to agree on this shape).
 */
export interface IntensityOption {
  label: string;
  difficulty: DifficultyValue;
  duration: number;
}

// ── Drawer Props ─────────────────────────────────────────────────────────

export interface WorkoutPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workout: WorkoutData | null;
  onStartWorkout?: (workoutId: string) => void;
  /**
   * When provided, displays the engine-generated workout exercises
   * with clean sets/reps formatting (no rest timers).
   * Bypasses the old Firestore fetch path.
   */
  generatedWorkout?: GeneratedWorkout | null;
  /** Active workout location (e.g. 'park', 'home') — persisted to sessionStorage for the player */
  workoutLocation?: string;
  /** Callback fired when the user swaps an exercise, with the updated GeneratedWorkout */
  onGeneratedWorkoutUpdate?: (updated: GeneratedWorkout) => void;
  /**
   * When provided, a pencil button is shown in the header.
   * Tapping it fires this callback so the parent can open the edit modal.
   */
  onEditEntry?: () => void;
  /**
   * Set to `true` by the parent the instant a new date is tapped so the
   * drawer rises up showing a skeleton shimmer instead of the previous
   * workout's stale exercises.  Cleared automatically when
   * `handleWorkoutGenerated` fires with fresh data.
   */
  isGeneratingWorkout?: boolean;
  /**
   * Trio/intensity options for the inline toggle row. Only rendered when
   * there are 2+ options — other WorkoutPreviewDrawer callers (calendar-tap
   * preview, the custom builder flow, FavoritesSheet) simply don't pass
   * these, so the row doesn't render there.
   */
  intensityOptions?: IntensityOption[];
  selectedIntensityIndex?: number;
  onSelectIntensity?: (index: number) => void;
}

// ── Section Grouping ─────────────────────────────────────────────────────

/** Section groups for exercise display (חימום, סופר-סט, סט רגיל, מתיחות) */
export interface ExerciseSection {
  id: string;
  title: string;
  rounds: number;
  exercises: EngineWorkoutExercise[];
}

// ── Equipment Collection ─────────────────────────────────────────────────

export interface EquipmentEntry {
  id: string;
  label: string;
}

// ── Workout Action Bundle ────────────────────────────────────────────────

/** Action-bar bindings passed into the GeneratedWorkoutExerciseList. */
export interface WorkoutActions {
  isFav: boolean;
  isFavToggling: boolean;
  isFavDownloading: boolean;
  isFavDownloaded: boolean;
  downloadProgress: number;
  isSharing: boolean;
  onToggleFavorite: () => void;
  onShare: () => void;
  onDownload: () => void;
}

// ── Pyramid Step Shape ───────────────────────────────────────────────────

/**
 * Single step inside a pyramid exercise (`EngineWorkoutExercise.pyramidSequence`).
 * Lifted into the shared types module so the orchestrator and the
 * memoised `PyramidStepCard` agree on the schema without re-declaring it inline.
 *
 * Either `targetReps` or `targetHold` is populated, never both:
 *   • `targetReps` → rep-based step (e.g. `8 reps`)
 *   • `targetHold` → time-based step (`buildStep` in pyramid.processor.ts
 *      multiplies the shape rep by TUT_REPS_TO_SECONDS = 2.5).
 */
export interface PyramidStep {
  exerciseId: string;
  name: string;
  targetReps?: number;
  targetHold?: number;
  imageUrl?: string;
  videoSrc?: string;
  level?: number;
  isSwapped?: boolean;
}
