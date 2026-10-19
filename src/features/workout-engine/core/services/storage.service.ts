// Workout Storage Service - Saves workout history to Firestore
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs, Timestamp, doc, updateDoc } from 'firebase/firestore';
import type { TimedBlockRecord } from '../../engines/timed/timed-record';
// NOTE: getStepsTrend lives in activity-history.service.ts (queries dailyActivity collection).
import { db, auth } from '@/lib/firebase';
import { clearHomeStartupCaches } from '@/lib/fast-startup/daily-record-cache';
import type { Lap } from '@/features/workout-engine/core/types/session.types';
import type { ExerciseResultLog } from '@/features/workout-engine/players/strength/hooks/useWorkoutStateMachine';
import type { CoachHintMark, RepsSource, WorkoutFeedbackRecord } from '@/features/workout-engine/adaptation/adaptation.types';

// Route coordinate format stored in Firestore (object format to avoid nested arrays)
export interface RoutePoint {
  lat: number;
  lng: number;
}

// ── Session segments (planned-vs-actual per unit) ──────────────────────────
// A workout is a sequence of segments; solo runs / strength sessions are
// one-segment sessions, a combined (hybrid) session chains several. Units are
// NEVER summed across kinds — aggregation is per-unit (combined-spec §0).
export type SessionSegmentKind = 'aerobic' | 'strength';

/**
 * Per-exercise, per-set detail for a completed strength segment (F1,
 * 19.08.2026 — "unified workout summary" plan). Field names intentionally
 * mirror ExerciseResultLog (useWorkoutStateMachine.ts) so callers can map
 * 1:1, but this type is storage-service-owned rather than a re-export —
 * same pattern as RoutePoint above — so the persisted schema stays
 * decoupled from that player-internal type's name/shape over time.
 * segmentId is deliberately dropped: it's an internal state-machine id with
 * no display value, and this array is already scoped to one segment via its
 * parent SessionSegmentRecord.index.
 */
export interface SegmentExerciseDetail {
  exerciseId: string;
  exerciseName: string;
  confirmedReps: number[];
  targetReps: number;
  /** Per-side reps for unilateral exercises (right side / ימין). */
  confirmedRepsRight?: number[];
  /** Per-side reps for unilateral exercises (left side / שמאל). */
  confirmedRepsLeft?: number[];

  // ── Soft-adaptation Phase 0 (data only, 18.10.2026) ──────────────────────
  // Additive and optional — absent on every doc saved before this existed.
  // Nothing reads these to change a level or a plan yet.
  /** Training domain of the prescribed slot (push/pull/legs/core/skill slug). */
  domain?: string;
  /** The exercise's program level as prescribed. */
  exerciseLevel?: number;
  /** The user's level in that domain when the plan was built. */
  userDomainLevel?: number;
  /** The prescribed rep/hold range. */
  prescribedRange?: { min: number; max: number };
  /** warmup / main / cooldown / recovery. */
  role?: string;
  /** The user swapped this slot (preview or in-workout). */
  wasSwapped?: true;
  /** The originally prescribed exercise of a swapped slot. */
  swappedFromId?: string;
  /**
   * Per set, parallel to confirmedReps: 'edited' = the user moved the
   * picker / typed it; 'default' = saved the prefilled target with one tap
   * (NOT evidence the user did that many); 'timer' = measured by the timer.
   */
  repsSource?: RepsSource[];
  /** Per set: the coach hint shown at save ('fail' | 'overachieve' | 'none'). */
  coachHints?: CoachHintMark[];
}

/**
 * Map live ExerciseResultLog[] (solo strength AND hybrid's strength station —
 * same player, same onComplete shape) into the persisted SegmentExerciseDetail[]
 * shape. Single shared conversion so the two call sites can't drift apart.
 */
export function toSegmentExerciseDetail(log: ExerciseResultLog[]): SegmentExerciseDetail[] {
  return log.map((entry) => ({
    exerciseId: entry.exerciseId,
    exerciseName: entry.exerciseName,
    confirmedReps: entry.confirmedReps,
    targetReps: entry.targetReps,
    ...(entry.confirmedRepsRight ? { confirmedRepsRight: entry.confirmedRepsRight } : {}),
    ...(entry.confirmedRepsLeft ? { confirmedRepsLeft: entry.confirmedRepsLeft } : {}),
    // Phase 0 (data only) — conditional keys, never undefined.
    ...(entry.domain ? { domain: entry.domain } : {}),
    ...(typeof entry.exerciseLevel === 'number' ? { exerciseLevel: entry.exerciseLevel } : {}),
    ...(typeof entry.userDomainLevel === 'number' ? { userDomainLevel: entry.userDomainLevel } : {}),
    ...(entry.prescribedRange ? { prescribedRange: { min: entry.prescribedRange.min, max: entry.prescribedRange.max } } : {}),
    ...(entry.role ? { role: entry.role } : {}),
    ...(entry.wasSwapped ? { wasSwapped: true as const } : {}),
    ...(entry.swappedFromId ? { swappedFromId: entry.swappedFromId } : {}),
    ...(entry.repsSource?.length ? { repsSource: entry.repsSource.slice(0, entry.confirmedReps.length) } : {}),
    ...(entry.coachHints?.length ? { coachHints: entry.coachHints.slice(0, entry.confirmedReps.length) } : {}),
  }));
}

/**
 * Planned targets / actual results for one segment. All fields optional —
 * callers must OMIT unknown keys (conditional spread), never pass undefined:
 * Firestore rejects undefined inside array elements.
 */
export interface SegmentMetrics {
  durationSec?: number;
  distanceKm?: number;
  paceMinKm?: number;
  calories?: number;
  /** Strength segments: exercise / set counts. */
  exercises?: number;
  sets?: number;
  /**
   * Strength segments: full per-exercise/per-set detail (F1, 19.08.2026).
   * Additive-only — absent on every doc saved before this field existed;
   * consumers must treat it as optional and fall back to the exercises/sets
   * counts above when it's missing.
   */
  exerciseLog?: SegmentExerciseDetail[];
}

export interface SessionSegmentRecord {
  /** Position of this segment within the session (0-based). */
  index: number;
  kind: SessionSegmentKind;
  /**
   * Aerobic segments only. Walking is a first-class aerobic unit — never
   * collapse it into 'running'. 'cycling' is written only by enable_home_v2
   * solo rides.
   */
  aerobicType?: 'running' | 'walking' | 'cycling';
  label?: string;
  planned?: SegmentMetrics;
  actual?: SegmentMetrics;
  /** Park where a strength segment took place (station linkage). */
  parkId?: string;
  /**
   * Strength segments only (22.09.2026, field-test doc 13): true when the
   * user explicitly declined this station via "דלג" — distinct from a
   * station simply never reached (this key is absent entirely then, same as
   * `actual` being absent). Lets a summary screen show "דילגת" specifically,
   * rather than treating every incomplete station the same way. Omitted
   * (never `false`) when not skipped — conditional like every other
   * optional field here (Firestore rejects `undefined` in array elements).
   */
  skipped?: true;
  /**
   * Epoch millis — plain numbers by design: serverTimestamp() is invalid
   * inside Firestore array elements (CLAUDE.md Firestore rules).
   */
  startedAtMs?: number;
  endedAtMs?: number;
}

/**
 * Per-block result of a PLANNED run (one entry per work block — interval /
 * run reps; recoveries, warm-up and cool-down are not listed). Written by
 * useRunningPlayer.finishWorkout as `blockResults`; optional — every older
 * doc, free run, walk and hybrid session has none, and readers must treat
 * its absence as "no per-rep data". Built by buildBlockRecords()
 * (players/running/lib/planned-rep-results.ts). Keys are only present when
 * known (Firestore rejects undefined inside arrays).
 */
export interface PlannedBlockRecord {
  /** Index in the materialized workout's blocks[]. */
  blockIndex: number;
  /** 1-based number among the workout's work blocks ("חזרה 3"). */
  rep: number;
  label: string;
  plannedDistanceMeters?: number;
  plannedDurationSeconds?: number;
  /** Actual distance covered in the block (m, rounded). */
  distanceMeters: number;
  /** Actual active seconds in the block. */
  durationSeconds: number;
  /** Target pace band (sec/km), when the block had one. */
  targetMinPaceSec?: number;
  targetMaxPaceSec?: number;
  /** Average pace (sec/km). Never stored for legs under 400 m (owner rule). */
  avgPaceSec?: number;
  /** avgPace inside the target band — only when both exist. */
  inRange?: boolean;
  /** Seconds outside the band: + slower, − faster, 0 inside. */
  paceDeltaSec?: number;
}

/**
 * Home v2 (enable_home_v2) run-type summary data, saved with a run as the
 * optional `runMeta` map ONLY while the flag is on (useRunningPlayer
 * .finishWorkout → buildRunSummaryMeta). Every older doc, every flag-off
 * run, walks and hybrid sessions have none; readers treat it as optional
 * field by field. Keys are only present when known (no undefined values).
 */
export interface RunSummaryMeta {
  /** RunWorkout.category ('easy_run', 'short_intervals', 'long_run', …). */
  category?: string;
  /** WeekSlot of the planned workout ('long_run', 'quality_primary', …). */
  slotType?: string;
  workoutId?: string;
  title?: string;
  /** Number of work blocks (reps) in the plan — the "6" of "6/6 חזרות". */
  plannedReps?: number;
  /** Distinct target bands of the work blocks (sec/km), in plan order. */
  zones?: { minPaceSec: number; maxPaceSec: number }[];
  /** Live accumulator (when the player provides one): seconds inside the band / seconds scored. */
  timeInZone?: { inSec: number; totalSec: number };
  /** Program position when started from the running plan (week / day ordinal). */
  plan?: { week: number; day: number };
  /** Planned runs: warm-up / cool-down actuals. */
  warmup?: { durationSeconds: number; distanceMeters: number };
  cooldown?: { durationSeconds: number; distanceMeters: number };
  /**
   * Per-km splits from the GPS trace, only when the run has no auto-km
   * laps: `km` is the cumulative distance at the split's end (the last one
   * may be partial, e.g. 5.6), `sec` the split's duration.
   */
  kmSplits?: { km: number; sec: number }[];
  /**
   * The runner edited paces on the v2 overview ("התאם קצב", this workout
   * only): the run is excluded from the pace self-correction.
   */
  paceOverridden?: true;
  /** The edited bands by target ("main.interval_short"), sec/km. */
  paceOverrides?: { key: string; minPaceSec: number; maxPaceSec: number }[];
  /** The main set was swapped on the overview ("6 × 400 מ׳" → "4 × 600 מ׳"). */
  mainSwap?: { from: string; to: string };
}

export interface WorkoutHistoryEntry {
  id?: string;
  userId: string;
  date: Date;
  /**
   * 'workout' is the legacy alias for strength; the active strength page has
   * been writing 'strength' since launch, so both live in stored docs.
   */
  activityType: 'running' | 'walking' | 'cycling' | 'workout' | 'strength' | 'hybrid';
  // Future-proof fields
  // 'recovery' added for the recovery-video-trio classification fix — see
  // RECOVERY_WORKOUT_CATEGORIZATION_ENABLED (src/config/feature-flags.ts).
  // activityType (above) is intentionally NOT widened: it's a legacy field
  // and every real consumer only falls back to it when workoutType is
  // absent, which never happens at the recovery write site.
  workoutType: 'running' | 'walking' | 'cycling' | 'strength' | 'hybrid' | 'recovery';
  category: 'cardio' | 'strength' | 'hybrid' | 'recovery';
  displayIcon: string; // Lucide icon name (e.g., 'run-fast', 'walk', 'bike')
  distance: number; // km
  duration: number; // seconds
  calories: number;
  pace: number; // minutes per km
  routePath?: RoutePoint[] | [number, number][]; // GPS coordinates - supports both formats for backward compatibility
  routeId?: string; // If guided route
  routeName?: string;
  /**
   * Auto-detected park (within 200 m) at workout completion.
   * Persisted on the workout doc so future analytics can group "popular parks"
   * directly off the workouts collection without a separate sessions write.
   * See `detectNearbyPark()` in park-detection.service.ts.
   */
  parkId?: string;
  parkName?: string;
  earnedCoins: number;
  /** Global XP earned in this session — written at save time for the activity history list. */
  xpEarned?: number;
  /**
   * Set to true when the Guardian Cloud Function failed to persist XP.
   * Lets backend jobs detect and manually re-award sessions where XP was lost.
   */
  xpAwardFailed?: boolean;
  /** Completed laps for this run. Active (in-progress) lap is excluded. */
  laps?: Lap[];
  /** Total metres of positive elevation gained during the run. */
  elevationGain?: number;
  /**
   * Per-unit planned-vs-actual segment records. Solo sessions write a single
   * segment; combined (hybrid) sessions chain aerobic + strength segments.
   * Root-level distance/duration/calories stay the session-wide aggregates so
   * existing history filters, leagues and challenges keep working unchanged.
   */
  segments?: SessionSegmentRecord[];
  /** Planned runs only: per-rep results (see PlannedBlockRecord). Optional. */
  blockResults?: PlannedBlockRecord[];
  /** Home v2 only: run-type summary data (see RunSummaryMeta). Optional. */
  runMeta?: RunSummaryMeta;

  // ── Training OS fields ────────────────────────────────────────────────
  /** Whether this was a recovery/maintenance workout (does not consume weekly volume budget) */
  isRecovery?: boolean;
  /** Difficulty level (1-3 bolts) used for this workout */
  difficulty?: 1 | 2 | 3;
  /** Total sets completed in this strength session */
  setsCompleted?: number;
  /** Total sets planned for this strength session */
  setsPlanned?: number;

  // ── Commute mode (A-to-B navigation) ──────────────────────────────────
  /**
   * Marks the session intent.
   *   'workout' (default / undefined) → traditional Free-Run loop.
   *   'commute' → A-to-B navigation. UI swaps to slim summary, awards
   *               commute XP, and the social feed is skipped to keep
   *               daily routes private.
   *
   * Stored alongside (rather than replacing) `workoutType` so existing
   * filters that group by activity (running / walking / cycling) keep
   * working unchanged. Treat the absence of this field as 'workout'.
   */
  sessionKind?: 'workout' | 'commute';
  /** Mapbox-native [lng, lat] of the commute destination, when sessionKind === 'commute'. */
  commuteDestination?: [number, number];
  /** Human-readable destination label captured at start of the commute (e.g. saved place name or geocoder text). */
  commuteLabel?: string;

  // ── Group session linkage ──────────────────────────────────────────────
  /** Ephemeral group ID this workout belongs to (set when run as part of a group session). */
  groupId?: string;
  /** Attendance document ID (YYYY-MM-DD_HH-mm) for the group session. */
  attendanceId?: string;

  /**
   * Soft-adaptation Phase 0 — the optional post-workout "קל מדי / בדיוק /
   * קשה מדי" answer (POST_WORKOUT_SURVEY_V1). Written as part of the create
   * payload (so an offline-queued workout carries it in its outbox payload
   * too). Recorded only — it changes no level and no progress.
   */
  feedback?: WorkoutFeedbackRecord;

  /**
   * enable_home_v2 — the AMRAP / EMOM / Tabata blocks of a strength session,
   * compact and bounded (engines/timed/timed-record). Optional and additive;
   * written only under the flag, in this same create. Read back by the
   * history summary (strength-history-adapter) to redraw the format cards.
   */
  timedBlocks?: TimedBlockRecord[];
}

/**
 * Get workout metadata based on activity type
 */
function getWorkoutMetadata(activityType: string): {
  workoutType: 'running' | 'walking' | 'cycling' | 'strength' | 'hybrid';
  category: 'cardio' | 'strength' | 'hybrid';
  displayIcon: string;
} {
  switch (activityType) {
    case 'running':
      return { workoutType: 'running', category: 'cardio', displayIcon: 'run-fast' };
    case 'walking':
      return { workoutType: 'walking', category: 'cardio', displayIcon: 'walk' };
    case 'cycling':
      return { workoutType: 'cycling', category: 'cardio', displayIcon: 'bike' };
    case 'workout':
    case 'strength':
      return { workoutType: 'strength', category: 'strength', displayIcon: 'dumbbell' };
    case 'hybrid':
      return { workoutType: 'hybrid', category: 'hybrid', displayIcon: 'activity' };
    default:
      // Unknown input — keep the historical running fallback, but every real
      // activityType now has an explicit case above (hybrid no longer
      // silently degrades to running).
      return { workoutType: 'running', category: 'cardio', displayIcon: 'run-fast' };
  }
}

/**
 * Save a completed workout to Firestore
 */
export async function saveWorkout(workout: Omit<WorkoutHistoryEntry, 'id' | 'date' | 'workoutType' | 'category' | 'displayIcon'> & Partial<Pick<WorkoutHistoryEntry, 'workoutType' | 'category' | 'displayIcon'>>): Promise<string | null> {
  // enable_fast_startup_v1: today's cached home carousel is stale the moment a workout is
  // logged. No-op unless that cache was ever written on this device.
  clearHomeStartupCaches();
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.error('❌ [DB] Cannot save workout: No User ID found');
      return null;
    }

    // Verify userId is provided and matches current user
    if (!workout.userId || workout.userId !== currentUser.uid) {
      console.warn('[WorkoutStorage] userId mismatch or missing, using currentUser.uid');
    }

    // Get workout metadata (use provided or derive from activityType)
    const metadata = workout.workoutType 
      ? {
          workoutType: workout.workoutType,
          category: workout.category || 'cardio',
          displayIcon: workout.displayIcon || 'run-fast',
        }
      : getWorkoutMetadata(workout.activityType);

    // Transform routePath from array format to [{lat, lng}] format for Firestore compatibility
    // Firestore doesn't support nested arrays, so we convert [[lng, lat]] to [{lat, lng}]
    // Use fallback: check both routePath and route properties, default to empty array
    const routeData = (workout.routePath || (workout as any).route || []) as any[];
    let formattedRoutePath: RoutePoint[] = [];
    
    if (Array.isArray(routeData) && routeData.length > 0) {
      try {
        formattedRoutePath = routeData.map((coord: any) => {
          // Handle array format: could be [lng, lat] (Mapbox) or [lat, lng] (legacy)
          if (Array.isArray(coord) && coord.length >= 2) {
            const first = Number(coord[0]);
            const second = Number(coord[1]);
            
            // Detect format: lat is always -90 to 90, lng is -180 to 180
            // If first value is outside lat range, it's likely [lng, lat] (Mapbox format)
            if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
              // [lng, lat] format - swap to {lat, lng}
              return {
                lat: second,
                lng: first
              };
            } else if (Math.abs(first) <= 90 && Math.abs(second) > 90) {
              // [lat, lng] format - use as is
              return {
                lat: first,
                lng: second
              };
            } else {
              // Ambiguous - assume [lng, lat] (Mapbox convention) and swap
              // This handles cases where both values are in valid ranges
              return {
                lat: second,
                lng: first
              };
            }
          } else if (coord && typeof coord === 'object' && 'lat' in coord && 'lng' in coord) {
            // Already in object format - validate and use
            return {
              lat: Number(coord.lat),
              lng: Number(coord.lng)
            };
          }
          throw new Error(`Invalid coordinate format: ${JSON.stringify(coord)}`);
        }).filter((point: RoutePoint) => {
          // Validate coordinates are within valid ranges
          return !isNaN(point.lat) && !isNaN(point.lng) && 
                 point.lat >= -90 && point.lat <= 90 && 
                 point.lng >= -180 && point.lng <= 180;
        });
      } catch (error) {
        console.warn('[WorkoutStorage] Error formatting routePath, using empty array:', error);
        formattedRoutePath = []; // Always use empty array instead of undefined
      }
    } else {
      // Ensure we always have an array, even if empty
      formattedRoutePath = [];
    }

    // Ensure all numeric fields have valid defaults
    const safeDistance = (typeof workout.distance === 'number' && !isNaN(workout.distance)) ? workout.distance : 0;
    const safeDuration = (typeof workout.duration === 'number' && !isNaN(workout.duration)) ? workout.duration : 0;
    const safeCalories = (typeof workout.calories === 'number' && !isNaN(workout.calories)) ? workout.calories : 0;
    const safePace = (typeof workout.pace === 'number' && !isNaN(workout.pace)) ? workout.pace : 0;
    const safeEarnedCoins = (typeof workout.earnedCoins === 'number' && !isNaN(workout.earnedCoins)) ? workout.earnedCoins : 0;

    const workoutData: Omit<WorkoutHistoryEntry, 'id'> = {
      ...workout,
      userId: currentUser.uid, // Always use current user's ID for security
      date: new Date(),
      workoutType: metadata.workoutType,
      category: metadata.category,
      displayIcon: metadata.displayIcon,
      distance: safeDistance,
      duration: safeDuration,
      calories: safeCalories,
      pace: safePace,
      earnedCoins: safeEarnedCoins,
      routePath: formattedRoutePath, // Always an array, never undefined
    };

    console.log('[DB] Saving workout to Firestore...', {
      userId: workoutData.userId,
      workoutType: workoutData.workoutType,
      distance: workoutData.distance,
      duration: workoutData.duration,
      calories: workoutData.calories,
      routePathLength: formattedRoutePath?.length || 0,
    });

    // Save to Firestore with try/catch around the actual save operation.
    // Native Phase: when the network is down (gym/bunker), enqueue to the
    // outbox instead of losing the workout. OutboxFlusher replays it on
    // reconnect, then awards XP via the Guardian (awardWorkoutXP).
    let docRef;
    try {
      docRef = await addDoc(collection(db, 'workouts'), {
      ...workoutData,
      date: serverTimestamp(), // Use server timestamp for consistency
    });
    } catch (saveError) {
      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      console.error('❌ [DB] Firestore addDoc error:', saveError, { isOffline });
      try {
        const { enqueueWorkout, generateLocalWorkoutId } = await import(
          '@/lib/outbox/outbox-db'
        );
        const localWorkoutId = generateLocalWorkoutId();
        await enqueueWorkout({
          localWorkoutId,
          uid: workoutData.userId,
          payload: workoutData,
          enqueuedAt: Date.now(),
          attempts: 0,
        });
        console.log(
          `📥 [DB] Workout queued offline (localId=${localWorkoutId}). ` +
          `Will sync on reconnect via OutboxFlusher.`,
        );
        return localWorkoutId;
      } catch (queueError) {
        console.error('❌ [DB] Failed to enqueue workout offline:', queueError);
        throw saveError;
      }
    }

    // users/{uid}.lastActive = the last real activity (18.10.2026). It used to
    // be written only at signup/onboarding, so the push schedulers saw
    // everyone as inactive. Fire-and-forget: never blocks or fails the save.
    try {
      void updateDoc(doc(db, 'users', workoutData.userId), { lastActive: serverTimestamp() }).catch((e) =>
        console.warn('[DB] lastActive stamp failed (non-blocking):', e),
      );
    } catch (e) {
      console.warn('[DB] lastActive stamp failed (non-blocking):', e);
    }

    console.log(`✅ [DB] Workout saved successfully with ID: ${docRef.id} (Type: ${metadata.workoutType}, Category: ${metadata.category}, Icon: ${metadata.displayIcon})`);
    return docRef.id;
  } catch (error) {
    console.error('❌ [DB] Error saving workout:', error);
    if (error instanceof Error) {
      console.error('❌ [DB] Error details:', error.message, error.stack);
    }
    return null;
  }
}

/**
 * Delete a workout document. Verifies ownership before deleting.
 * Returns the deleted doc's data (for XP reversal) or null on failure.
 */
export async function deleteWorkout(workoutId: string): Promise<WorkoutHistoryEntry | null> {
  clearHomeStartupCaches(); // see saveWorkout
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;

    const { doc, getDoc, deleteDoc } = await import('firebase/firestore');
    const ref = doc(db, 'workouts', workoutId);
    const snap = await getDoc(ref);

    if (!snap.exists() || snap.data().userId !== currentUser.uid) {
      console.warn('[deleteWorkout] Not found or access denied:', workoutId);
      return null;
    }

    const data = snap.data() as WorkoutHistoryEntry;
    await deleteDoc(ref);
    console.log('[deleteWorkout] Deleted:', workoutId);
    return data;
  } catch (err) {
    console.error('[deleteWorkout] Failed:', err);
    return null;
  }
}

/**
 * Fetch one workout doc by id (F1.3, 19.08.2026 — "unified workout summary"
 * plan). No precedent existed for this before F1 — active/page.tsx's own
 * Firestore fallback synthesizes a fresh generic plan, it doesn't read a
 * saved workout doc (confirmed during F1's investigation).
 *
 * Same "don't distinguish not-found from access-denied" posture as
 * deleteWorkout() above (both return null either way) — avoids leaking
 * whether a given id exists to a caller who isn't its owner.
 *
 * Maps every WorkoutHistoryEntry field, unlike getWorkoutHistory() above
 * (which omits segments/setsCompleted/setsPlanned/difficulty — a real,
 * separate, pre-existing gap in the list-view mapping, not something this
 * function should copy). A single-doc fetch has no list-performance reason
 * to trim fields.
 */
export async function getWorkoutById(
  workoutId: string,
  userId: string,
): Promise<WorkoutHistoryEntry | null> {
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'workouts', workoutId));
    if (!snap.exists() || snap.data().userId !== userId) {
      console.warn('[getWorkoutById] Not found or access denied:', workoutId);
      return null;
    }
    return mapFullWorkoutDoc(snap.id, snap.data());
  } catch (error) {
    console.error('[getWorkoutById] Failed to fetch workout:', workoutId, error);
    return null;
  }
}

/** Tolerant read of the optional `blockResults` array (absent/malformed ⇒ undefined). */
export function readBlockResults(raw: unknown): PlannedBlockRecord[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter(
    (r): r is PlannedBlockRecord =>
      !!r && typeof r === 'object' &&
      typeof (r as PlannedBlockRecord).blockIndex === 'number' &&
      typeof (r as PlannedBlockRecord).durationSeconds === 'number',
  );
  return out.length > 0 ? out : undefined;
}

/** Tolerant read of the optional `runMeta` map (absent/malformed ⇒ undefined). */
export function readRunMeta(raw: unknown): RunSummaryMeta | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return raw as RunSummaryMeta;
}

/**
 * Full-fidelity Firestore doc -> WorkoutHistoryEntry mapping, shared between
 * getWorkoutById (F1.3) and getWorkoutsForDate (F2.2, below) so the two
 * single-purpose fetches can't drift apart on which fields they map.
 */
function mapFullWorkoutDoc(id: string, data: Record<string, unknown>): WorkoutHistoryEntry {
  let routePath: RoutePoint[] | [number, number][] | undefined;
  if (data.routePath && Array.isArray(data.routePath)) {
    if (data.routePath.length > 0 && typeof data.routePath[0] === 'object' && 'lat' in (data.routePath[0] as object)) {
      routePath = data.routePath as RoutePoint[];
    } else if (Array.isArray(data.routePath[0])) {
      routePath = data.routePath as [number, number][];
    }
  }

  return {
    id,
    userId: data.userId,
    date: toDate(data.date) || new Date(),
    activityType: data.activityType || 'running',
    workoutType: data.workoutType || 'running',
    category: data.category || 'cardio',
    displayIcon: data.displayIcon || 'run-fast',
    distance: data.distance || 0,
    duration: data.duration || 0,
    calories: data.calories || 0,
    pace: data.pace || 0,
    routePath,
    routeId: data.routeId,
    routeName: data.routeName,
    parkId: data.parkId,
    parkName: data.parkName,
    earnedCoins: data.earnedCoins || 0,
    xpEarned: data.xpEarned ?? 0,
    xpAwardFailed: data.xpAwardFailed,
    laps: Array.isArray(data.laps) ? data.laps : undefined,
    elevationGain: typeof data.elevationGain === 'number' ? data.elevationGain : undefined,
    segments: Array.isArray(data.segments) ? data.segments : undefined,
    blockResults: readBlockResults(data.blockResults),
    runMeta: readRunMeta(data.runMeta),
    isRecovery: data.isRecovery,
    difficulty: data.difficulty,
    setsCompleted: data.setsCompleted,
    setsPlanned: data.setsPlanned,
    sessionKind: data.sessionKind,
    commuteDestination: data.commuteDestination,
    commuteLabel: data.commuteLabel,
    groupId: data.groupId,
    attendanceId: data.attendanceId,
  } as WorkoutHistoryEntry;
}

/**
 * Every real workout doc for one user on one local calendar day, most recent
 * first (F2.2/F2.3, 19.08.2026 — "unified workout summary" plan). No entry
 * point (schedule tap, home activity-card tap) had any existing link from
 * "this day/category" to a real `workouts` doc id before this — confirmed
 * during F2's investigation: schedule entries come from `userSchedule`
 * (planned data), completion coloring comes from `dailyProgress`, neither
 * carries a workout doc id.
 *
 * Deliberately uses ONLY `where('userId', ...)` + a `date` range + `orderBy`,
 * matching the EXISTING {userId, date} composite index in
 * firestore.indexes.json byte-for-byte (verified before writing this) — no
 * new index needs deploying. A `category`/`workoutType` filter was
 * deliberately left OUT for the same reason (would need a new composite
 * index); callers that need one category filter the small returned list
 * client-side instead — a real calendar day realistically has 1-3 workout
 * docs, so this is cheap.
 *
 * `dateISO` is a LOCAL calendar day ('YYYY-MM-DD', toISODate's format) —
 * boundaries are constructed in local time to match, not UTC.
 *
 * A malformed `dateISO` resolves to `[]` (nothing to query). A genuine
 * Firestore failure THROWS instead of resolving to `[]` (fix-round, #6,
 * 19-21.08.2026) — a caught-and-swallowed error here used to be
 * indistinguishable from "no workout that day," which sent
 * `tryOpenCompletedWorkout` (home/page.tsx) silently down the wrong
 * fallback path (opening a new-workout drawer instead of surfacing that the
 * lookup itself failed). Callers now decide their own fallback per call
 * site — see `tryOpenCompletedWorkout`'s own try/catch.
 */
export async function getWorkoutsForDate(
  userId: string,
  dateISO: string,
): Promise<WorkoutHistoryEntry[]> {
  const [year, month, day] = dateISO.split('-').map(Number);
  if (!year || !month || !day) return [];
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endOfDay = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', userId),
    where('date', '>=', Timestamp.fromDate(startOfDay)),
    where('date', '<', Timestamp.fromDate(endOfDay)),
    orderBy('date', 'desc'),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => mapFullWorkoutDoc(docSnap.id, docSnap.data()));
}

/**
 * Every real workout doc for one user across a range of local calendar days,
 * most recent first — same query shape as `getWorkoutsForDate` above (single
 * `where('userId', ...)` + a `date` range + `orderBy`), just with wider
 * bounds, so it matches the SAME existing `{userId, date}` composite index —
 * no new Firestore index needs deploying.
 *
 * One query for a whole visible date range (e.g. RollingAgenda's past dates
 * + today) instead of N per-date reads — cost is proportional to actual
 * workout docs in the window (realistically 1-3 per active day), not to
 * day-count. Callers group the flat result by ISO date client-side.
 *
 * `startISO`/`endISO` are LOCAL calendar days ('YYYY-MM-DD'), inclusive on
 * both ends — boundaries are constructed in local time to match.
 */
export async function getWorkoutsInDateRange(
  userId: string,
  startISO: string,
  endISO: string,
): Promise<WorkoutHistoryEntry[]> {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return [];
  const startOfRange = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
  const endOfRange = new Date(ey, em - 1, ed + 1, 0, 0, 0, 0); // exclusive upper bound = day AFTER endISO

  const q = query(
    collection(db, 'workouts'),
    where('userId', '==', userId),
    where('date', '>=', Timestamp.fromDate(startOfRange)),
    where('date', '<', Timestamp.fromDate(endOfRange)),
    orderBy('date', 'desc'),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => mapFullWorkoutDoc(docSnap.id, docSnap.data()));
}

/**
 * Convert Firestore Timestamp to Date
 */
function toDate(timestamp: unknown): Date | undefined {
  if (timestamp == null) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'number') {
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
    return (timestamp as Timestamp).toDate();
  }
  return undefined;
}

/**
 * Fetch the last N run or walk sessions for a user, ordered chronologically
 * (oldest → newest), ready for direct use as Recharts chart data.
 *
 * Returns an empty array when the user is offline, has no history, or on error.
 *
 * @param userId       Firestore user ID
 * @param activityType 'running' | 'walking'  (default: 'running')
 * @param limitCount   Max sessions to return (default: 8 — fits a bar chart nicely)
 *
 * @example
 * const trend = await getRunTrend(userId, 'running', 8);
 * const chartData = trend.map((w, i) => ({
 *   session: i + 1,
 *   distance: w.distance,
 *   duration: Math.round(w.duration / 60),
 *   pace: w.pace,
 * }));
 */
export async function getRunTrend(
  userId: string,
  activityType: 'running' | 'walking' = 'running',
  limitCount: number = 8,
): Promise<WorkoutHistoryEntry[]> {
  if (!userId) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];

  try {
    const q = query(
      collection(db, 'workouts'),
      where('userId', '==', userId),
      where('workoutType', '==', activityType),
      orderBy('date', 'desc'),
      limit(limitCount),
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return [];

    const entries: WorkoutHistoryEntry[] = snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          userId: data.userId,
          date: toDate(data.date) || new Date(),
          activityType: data.activityType || activityType,
          workoutType: data.workoutType || activityType,
          category: data.category || 'cardio',
          displayIcon: data.displayIcon || 'run-fast',
          distance: data.distance || 0,
          duration: data.duration || 0,
          calories: data.calories || 0,
          pace: data.pace || 0,
          earnedCoins: data.earnedCoins || 0,
        } as WorkoutHistoryEntry;
      })
      .reverse(); // Chronological order (oldest → newest) for chart x-axis

    console.log(
      `[WorkoutStorage] getRunTrend: ${entries.length} ${activityType} sessions for user ${userId}`,
    );
    return entries;
  } catch (error) {
    console.warn('[WorkoutStorage] getRunTrend failed:', error);
    return [];
  }
}

/**
 * Get user's workout history from Firestore
 */
export async function getWorkoutHistory(userId: string, limitCount: number = 50): Promise<WorkoutHistoryEntry[]> {
  try {
    const q = query(
      collection(db, 'workouts'),
      where('userId', '==', userId),
      orderBy('date', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    const workouts: WorkoutHistoryEntry[] = [];

    snapshot.docs.forEach((docSnap) => {
      try {
      const data = docSnap.data();
        
        // Handle routePath - support both old format [[lat, lng]] and new format [{lat, lng}]
        let routePath: RoutePoint[] | [number, number][] | undefined;
        if (data.routePath && Array.isArray(data.routePath)) {
          // Check if it's the new format (objects) or old format (arrays)
          if (data.routePath.length > 0 && typeof data.routePath[0] === 'object' && 'lat' in data.routePath[0]) {
            // New format: [{lat, lng}]
            routePath = data.routePath as RoutePoint[];
          } else if (Array.isArray(data.routePath[0])) {
            // Old format: [[lat, lng]] - keep as is for backward compatibility
            routePath = data.routePath as [number, number][];
          }
        }
        
      workouts.push({
        id: docSnap.id,
        userId: data.userId,
        date: toDate(data.date) || new Date(),
        activityType: data.activityType || 'running',
        workoutType: data.workoutType || 'running',
        category: data.category || 'cardio',
        displayIcon: data.displayIcon || 'run-fast',
        distance: data.distance || 0,
        duration: data.duration || 0,
        calories: data.calories || 0,
        pace: data.pace || 0,
          routePath: routePath,
        routeId: data.routeId,
        routeName: data.routeName,
        parkId: data.parkId,
        parkName: data.parkName,
        earnedCoins: data.earnedCoins || 0,
        xpEarned: data.xpEarned ?? 0,
        laps: Array.isArray(data.laps) ? data.laps : undefined,
        elevationGain: typeof data.elevationGain === 'number' ? data.elevationGain : undefined,
        isRecovery: data.isRecovery,
      });
      } catch (error) {
        console.error('[WorkoutStorage] Error parsing workout document:', docSnap.id, error);
        // Skip malformed documents instead of crashing
      }
    });

    return workouts;
  } catch (error) {
    console.error('[WorkoutStorage] Error fetching workout history:', error);
    // If index doesn't exist, return empty array instead of failing
    if (error instanceof Error && error.message.includes('index')) {
      console.warn('[WorkoutStorage] Workout history index not found. Returning empty array.');
      return [];
    }
    return [];
  }
}
