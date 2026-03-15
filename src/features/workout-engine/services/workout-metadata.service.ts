/**
 * Workout Metadata Service — Scoring & Shuffle Engine
 *
 * Fetches workout titles, descriptions, AI cues, and motivational phrases
 * from Firestore's `workoutMetadata` collection using a points-based
 * scoring system with shuffle-among-ties for variety.
 *
 * SCORING RULE:
 *   For every user attribute that matches a Firestore row
 *   (persona, location, timeOfDay, gender, sportType,
 *    motivationStyle, experienceLevel) the row earns +1 point.
 *   The engine selects the highest-scoring row(s) and picks
 *   one at random to ensure content variety across sessions.
 *
 * GENDER RULE:
 *   - Exact gender match = +1
 *   - Row gender is 'both' or empty = neutral (0)
 *   - Gender mismatch = hard-exclude (-1)
 *
 * Admin Panel creates this data at: /admin/workout-settings
 *
 * ZERO HARDCODING: All user-facing strings come from Firestore.
 * The only hardcoded strings are internal fallbacks for dev/testing.
 */

import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { LifestylePersona } from '../logic/ContextualEngine';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import { resolveContentTags, TagResolverContext } from '@/features/content/branding/core/branding.utils';

// ============================================================================
// TYPES
// ============================================================================

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface WorkoutMetadataContext {
  persona: LifestylePersona | null;
  location: ExecutionLocation;
  timeOfDay: TimeOfDay;
  gender?: 'male' | 'female';
  daysInactive?: number;
  /** User's sport type for content scoring (e.g., 'basketball', 'running') */
  sportType?: string;
  /** Preferred motivation style (e.g., 'tough', 'encouraging', 'scientific') */
  motivationStyle?: string;
  /** User's experience level (e.g., 'beginner', 'advanced', 'pro') */
  experienceLevel?: string;
  /** User's current program progress (0-100%) for Level-Up bonus */
  programProgress?: number;
  /** Current program name for @שם_תוכנית tag */
  currentProgram?: string;
  /** Target level for @רמה_הבאה tag */
  targetLevel?: number;
  /** Distance in meters for Proximity notifications */
  distanceMeters?: number;
  /** Estimated arrival time for Proximity notifications */
  estimatedArrivalMinutes?: number;
  /** Study/focus mode flag (triggered by library location or future Focus Mode) */
  isStudying?: boolean;
  /** Workout category for scoring bonuses and @קטגוריה tag */
  category?: string;
  /** Workout duration in minutes for @זמן_אימון tag and scoring */
  durationMinutes?: number;
  /** Difficulty level (1|2|3) for @עצימות tag */
  difficulty?: number | string;
  /** Precomputed dominant muscle group for @מיקוד tag */
  dominantMuscle?: string;
  /** Hebrew display name of workout category for @קטגוריה tag */
  categoryLabel?: string;
  /** Current day period: 'start_of_week' | 'mid_week' | 'weekend' */
  dayPeriod?: string;

  // === Running-Specific Context ===
  /** User's base pace in seconds per kilometer (for @קצב_בסיס tag) */
  runningBasePace?: number;
  /** Target race distance label, e.g. '5 ק"מ' (for @מרחק_יעד tag) */
  targetDistanceLabel?: string;
  /** Current program phase, e.g. 'base' | 'build' | 'peak' | 'taper' (for @שלב_תוכנית tag) */
  programPhase?: string;
  /** Running workout category, e.g. 'short_intervals' | 'tempo' (for scoring) */
  runningCategory?: string;

  // === Program Hierarchy Context ===
  /** Active Reserve flag — gives +20 to reservist-targeted content */
  isActiveReserve?: boolean;
  /** The user's currently active (child) program ID (e.g., 'push', 'pull') */
  activeProgramId?: string;
  /** The user's level within the active child program (from tracks) */
  programLevel?: number;
  /** IDs of all ancestor master programs (e.g., ['upper_body', 'full_body']) */
  ancestorProgramIds?: string[];
}

export interface ResolvedWorkoutMetadata {
  /** Dynamic title from Firestore (or fallback) */
  title: string | null;
  /** Dynamic description from Firestore (or fallback) */
  description: string | null;
  /** AI cue / motivational phrase from Firestore (or fallback) */
  aiCue: string | null;
  /** Per-variant coaching explanation (Coach's Note) */
  logicCue: string | null;
  /** Source of the resolved metadata (for debugging) */
  source: 'firestore' | 'fallback';
}

// ============================================================================
// FIRESTORE COLLECTIONS
// ============================================================================

const METADATA_BASE = 'workoutMetadata';
const TITLES_SUBCOLLECTION = 'titles';
const DESCRIPTIONS_SUBCOLLECTION = 'descriptions';
const PHRASES_SUBCOLLECTION = 'phrases';
const LOGIC_CUES_SUBCOLLECTION = 'cues';
const LOGIC_CUES_PARENT = 'logicCues';

export type TrioVariant = 'balanced' | 'intense' | 'naked' | 'easy';

/** Enable detailed console logs for Title/Description resolution (debugging). */
const DEBUG_METADATA_RESOLUTION = true;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Detect current time of day from the user's local clock.
 */
export function detectTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Detect current day period based on the weekday.
 * Sunday(0) & Monday(1) → start_of_week
 * Tuesday(2)-Thursday(4) → mid_week
 * Friday(5) & Saturday(6) → weekend
 */
export type DayPeriod = 'start_of_week' | 'mid_week' | 'weekend';

export function detectDayPeriod(): DayPeriod {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (day === 0 || day === 1) return 'start_of_week';
  if (day >= 2 && day <= 4) return 'mid_week';
  return 'weekend'; // Friday & Saturday
}

/**
 * Hebrew labels for time of day (for UI selectors).
 */
export const TIME_OF_DAY_OPTIONS: { id: TimeOfDay; label: string; icon: string }[] = [
  { id: 'morning',   label: 'בוקר',  icon: '🌅' },
  { id: 'afternoon', label: 'צהריים', icon: '☀️' },
  { id: 'evening',   label: 'ערב',   icon: '🌇' },
  { id: 'night',     label: 'לילה',  icon: '🌙' },
];

// ============================================================================
// SCORING & SHUFFLE ENGINE
// ============================================================================

/**
 * Scorable fields: every attribute that can earn +1 if it matches.
 * Gender has a special rule: a row with gender='both' or no gender
 * is NOT penalized, but an exact gender match earns +1.
 * 
 * progressRange is scored with special logic that includes a LEVEL-UP BONUS.
 */
const SCORABLE_FIELDS: Array<{
  /** Firestore field name on the content row */
  rowField: string;
  /** Key on WorkoutMetadataContext */
  ctxKey: keyof WorkoutMetadataContext;
  /** If true, a missing/empty row value is neutral (no penalty). */
  neutralWhenEmpty: boolean;
}> = [
  { rowField: 'persona',         ctxKey: 'persona',         neutralWhenEmpty: true },
  { rowField: 'location',        ctxKey: 'location',        neutralWhenEmpty: true },
  { rowField: 'timeOfDay',       ctxKey: 'timeOfDay',       neutralWhenEmpty: true },
  { rowField: 'gender',          ctxKey: 'gender',          neutralWhenEmpty: true },
  { rowField: 'sportType',       ctxKey: 'sportType',       neutralWhenEmpty: true },
  { rowField: 'motivationStyle', ctxKey: 'motivationStyle', neutralWhenEmpty: true },
  { rowField: 'experienceLevel', ctxKey: 'experienceLevel', neutralWhenEmpty: true },
  // Note: progressRange is NOT in this array - it has custom scoring logic below
];

/**
 * Score a single Firestore content row against the user's context.
 *
 * Rule: For every attribute that matches, the row gets +1.
 * Gender 'both' counts as a match if the user has a gender set.
 * Empty/missing row fields are neutral (0, not -1).
 *
 * LEVEL-UP BONUS:
 *   If user's programProgress > 90 AND row's progressRange === '90-100',
 *   the row earns a massive +5 bonus to prioritize level-up content.
 *
 * Returns -1 if the row is incompatible (e.g., gender mismatch).
 */
function scoreContentRow(row: any, ctx: WorkoutMetadataContext): number {
  let score = 0;

  for (const field of SCORABLE_FIELDS) {
    const rowVal = row[field.rowField];
    const ctxVal = ctx[field.ctxKey];

    // Row has no value for this field → neutral
    if (!rowVal || rowVal === '' || rowVal === 'any') continue;

    // Context has no value for this field → neutral
    if (!ctxVal || ctxVal === '') continue;

    // Gender special handling: 'both' matches any gender
    if (field.rowField === 'gender') {
      if (rowVal === 'both') {
        // Neutral — don't add or subtract
        continue;
      }
      if (rowVal === ctxVal) {
        score += 1; // Exact gender match
      } else {
        return -1; // Gender mismatch → hard exclude
      }
      continue;
    }

    // Standard match
    if (rowVal === ctxVal) {
      score += 1;
    }
  }

  // ============================================================================
  // PROGRESS RANGE SCORING + LEVEL-UP BONUS
  // ============================================================================
  const rowProgress = row.progressRange; // '0-20' | '20-90' | '90-100'
  const userProgress = ctx.programProgress;

  if (rowProgress && userProgress !== undefined && userProgress !== null) {
    // Parse the range
    const parts = rowProgress.split('-');
    if (parts.length === 2) {
      const [minStr, maxStr] = parts;
      const min = parseInt(minStr, 10);
      const max = parseInt(maxStr, 10);

      // Check if user's progress falls within this range
      if (!isNaN(min) && !isNaN(max) && userProgress >= min && userProgress <= max) {
        score += 1; // Base match for being in the correct range

        // LEVEL-UP BONUS: +5 if user is >90% AND content targets 90-100
        if (userProgress > 90 && rowProgress === '90-100') {
          score += 5; // Strong boost for level-up content
        }
      }
    }
  }

  // ============================================================================
  // CONTEXTUAL SCORING BONUSES
  // ============================================================================
  const rowCategory = (row.category || '').toLowerCase();

  // OFFICE PRIORITY: Mobility/Flexibility bonus for office workers
  // Encourages short movement breaks at the desk
  if (ctx.location === 'office') {
    if (rowCategory === 'mobility' || rowCategory === 'flexibility') {
      score += 3;
    }
  }

  // STUDY/LIBRARY PRIORITY: Mental break content for students
  // Gentle mobility/general workouts to refresh focus
  if (ctx.location === 'library' || ctx.isStudying) {
    if (rowCategory === 'mobility' || rowCategory === 'general') {
      score += 3;
    }
  }

  // EVENING/NIGHT SHORT WORKOUTS: Relaxing wind-down priority
  // When it's late AND workout is very short, prefer calming content
  if ((ctx.timeOfDay === 'evening' || ctx.timeOfDay === 'night') && ctx.durationMinutes && ctx.durationMinutes < 10) {
    if (rowCategory === 'mobility' || rowCategory === 'general') {
      if (row.motivationStyle === 'zen' || row.motivationStyle === 'encouraging') {
        score += 2;
      }
    }
  }

  // DURATION MATCH: ShortForm preference for short workouts (<10 min)
  if (ctx.durationMinutes && ctx.durationMinutes < 10) {
    if (row.tags && Array.isArray(row.tags) && row.tags.includes('ShortForm')) {
      score += 2;
    }
  }

  // ============================================================================
  // DAY PERIOD BONUS
  // ============================================================================
  // If the row specifies a dayPeriod and it matches the current day, +2 bonus.
  // 'all' or empty means the row applies to any day (neutral).
  const rowDayPeriod = row.dayPeriod;
  if (rowDayPeriod && rowDayPeriod !== '' && rowDayPeriod !== 'all' && ctx.dayPeriod) {
    if (rowDayPeriod === ctx.dayPeriod) {
      score += 2; // Day-period match bonus
    }
  }

  // ============================================================================
  // RESERVIST BOOST (+20)
  // ============================================================================
  // If the user has isActiveReserve=true and the row targets persona='reservist',
  // give a massive +20 boost to surface reservist-relevant content.
  if (ctx.isActiveReserve && row.persona === 'reservist') {
    score += 20;
  }

  // ============================================================================
  // PROGRAM-SPECIFIC HARD FILTER (with hierarchy support)
  // ============================================================================
  // If a content row has a programId, it must match the user's active program
  // OR one of its ancestors/descendants in the Master hierarchy.
  // If it doesn't match, return 0 (hard exclude).
  // If programId is empty or 'all', the row is "General" → always eligible.
  const rowProgramId = row.programId;
  if (rowProgramId && rowProgramId !== '' && rowProgramId !== 'all') {
    const userProgram = ctx.activeProgramId;
    const ancestors = ctx.ancestorProgramIds || [];

    // Check: exact match with active child program
    const isExactMatch = userProgram === rowProgramId;
    // Check: the row targets a parent/ancestor of the user's active program
    const isAncestorMatch = ancestors.includes(rowProgramId);
    // Check: the row targets a sibling/child — skip (don't show Push content to Pull users)

    if (!isExactMatch && !isAncestorMatch) {
      return 0; // Hard exclude — program doesn't match
    }

    // Exact child match is stronger than ancestor match
    if (isExactMatch) {
      score += 3; // Strong bonus for program-specific content
    } else if (isAncestorMatch) {
      score += 1; // Mild bonus for parent-program content (e.g., Upper Body content for Push user)
    }
  }

  // ============================================================================
  // LEVEL RANGE FILTER (program-specific level)
  // ============================================================================
  // If the row has minLevel/maxLevel, check against the user's level in the
  // active child program (not globalLevel).
  const rowMinLevel = row.minLevel;
  const rowMaxLevel = row.maxLevel;
  const userProgramLevel = ctx.programLevel;

  if ((rowMinLevel || rowMaxLevel) && userProgramLevel !== undefined) {
    if (rowMinLevel && userProgramLevel < rowMinLevel) {
      return 0; // User's level is too low
    }
    if (rowMaxLevel && userProgramLevel > rowMaxLevel) {
      return 0; // User's level is too high
    }
    // Level range match — bonus
    score += 1;
  }

  return score;
}

/**
 * Build human-readable match reasons for a winning row (for debug logging).
 */
function getMatchReasons(row: any, ctx: WorkoutMetadataContext): string[] {
  const reasons: string[] = [];
  for (const field of SCORABLE_FIELDS) {
    const rowVal = row[field.rowField];
    const ctxVal = ctx[field.ctxKey];
    if (!rowVal || rowVal === '' || rowVal === 'any') continue;
    if (!ctxVal || ctxVal === '') continue;
    if (field.rowField === 'gender' && rowVal === 'both') continue;
    if (field.rowField === 'gender' && rowVal !== ctxVal) continue; // mismatch
    if (rowVal === ctxVal) {
      reasons.push(`${field.rowField}=${String(ctxVal)}`);
    }
  }
  if (row.progressRange && ctx.programProgress != null) {
    const parts = row.progressRange.split('-');
    if (parts.length === 2) {
      const [min, max] = parts.map(Number);
      if (!isNaN(min) && !isNaN(max) && ctx.programProgress >= min && ctx.programProgress <= max) {
        reasons.push(`progressRange=${row.progressRange}`);
        if (ctx.programProgress > 90 && row.progressRange === '90-100') {
          reasons.push('LEVEL-UP_BONUS(+5)');
        }
      }
    }
  }
  const rowProgramId = row.programId;
  if (rowProgramId && rowProgramId !== '' && rowProgramId !== 'all') {
    const isExact = ctx.activeProgramId === rowProgramId;
    const isAncestor = (ctx.ancestorProgramIds || []).includes(rowProgramId);
    if (isExact) reasons.push(`activeProgramId=${rowProgramId}(+3)`);
    else if (isAncestor) reasons.push(`ancestorProgramId=${rowProgramId}(+1)`);
  }
  if (row.minLevel != null || row.maxLevel != null) {
    if (ctx.programLevel != null) reasons.push(`levelRange=${row.minLevel ?? '?'}-${row.maxLevel ?? '?'}`);
  }
  if (ctx.isActiveReserve && row.persona === 'reservist') reasons.push('reservist(+20)');
  const rowCat = (row.category || '').toLowerCase();
  if (ctx.location === 'office' && (rowCat === 'mobility' || rowCat === 'flexibility')) {
    reasons.push('office_mobility(+3)');
  }
  if ((ctx.location === 'library' || ctx.isStudying) && (rowCat === 'mobility' || rowCat === 'general')) {
    reasons.push('study_mobility(+3)');
  }
  if (row.dayPeriod && row.dayPeriod !== 'all' && ctx.dayPeriod && row.dayPeriod === ctx.dayPeriod) {
    reasons.push(`dayPeriod=${ctx.dayPeriod}(+2)`);
  }
  return reasons;
}

/**
 * Generic scored fetch: load all rows from a subcollection,
 * score each against the context, pick the highest, shuffle among ties.
 *
 * @param parentDoc  Parent doc path (e.g., 'workoutTitles')
 * @param subCol     Subcollection name (e.g., 'titles')
 * @param textField  The field that contains the user-facing string
 * @param ctx        The user's metadata context
 */
async function scoredFetch(
  parentDoc: string,
  subCol: string,
  textField: string,
  ctx: WorkoutMetadataContext,
): Promise<string | null> {
  try {
    const ref = collection(db, METADATA_BASE, parentDoc, subCol);
    const snap = await getDocs(ref);
    if (snap.empty) return null;

    const allRows = snap.docs.map(d => d.data());

    // Score every row
    let bestScore = -1;
    let bestRows: any[] = [];

    for (const row of allRows) {
      const score = scoreContentRow(row, ctx);
      if (score < 0) continue; // Hard-excluded (gender mismatch)

      if (score > bestScore) {
        bestScore = score;
        bestRows = [row];
      } else if (score === bestScore) {
        bestRows.push(row);
      }
    }

    if (bestRows.length === 0) return null;

    // Shuffle: pick random among the highest-scoring rows
    const picked = bestRows[Math.floor(Math.random() * bestRows.length)];
    const result = picked[textField] || null;

    if (DEBUG_METADATA_RESOLUTION && result) {
      const contentType = parentDoc === 'workoutTitles' ? 'Title' : parentDoc === 'smartDescriptions' ? 'Description' : 'Phrase';
      const reasons = getMatchReasons(picked, ctx);
      console.group(`[WorkoutMetadata] ${contentType} resolution`);
      console.log(`Result: "${result}"`);
      console.log(`Score: ${bestScore} | Tied rows: ${bestRows.length}`);
      console.log(`Why chosen: ${reasons.length ? reasons.join('; ') : '(base score only)'}`);
      console.groupEnd();
    }

    return result;
  } catch (error) {
    console.warn(`[WorkoutMetadata] Error in scoredFetch(${parentDoc}/${subCol}):`, error);
    return null;
  }
}

// ============================================================================
// FETCH WRAPPERS (delegate to Scoring Engine)
// ============================================================================

async function fetchWorkoutTitle(ctx: WorkoutMetadataContext): Promise<string | null> {
  return scoredFetch('workoutTitles', TITLES_SUBCOLLECTION, 'text', ctx);
}

async function fetchSmartDescription(ctx: WorkoutMetadataContext): Promise<string | null> {
  return scoredFetch('smartDescriptions', DESCRIPTIONS_SUBCOLLECTION, 'description', ctx);
}

async function fetchMotivationalPhrase(ctx: WorkoutMetadataContext): Promise<string | null> {
  return scoredFetch('motivationalPhrases', PHRASES_SUBCOLLECTION, 'phrase', ctx);
}

/**
 * Fetch a logic cue from `workoutMetadata/logicCues/cues`.
 * Rows are scored like other metadata but also filtered by `variant`.
 * If no Firestore data exists, returns a computed fallback.
 */
async function fetchLogicCue(
  ctx: WorkoutMetadataContext,
  variant: TrioVariant,
): Promise<string | null> {
  try {
    const ref = collection(db, METADATA_BASE, LOGIC_CUES_PARENT, LOGIC_CUES_SUBCOLLECTION);
    const snap = await getDocs(ref);

    if (!snap.empty) {
      let bestScore = -1;
      let bestRows: any[] = [];

      for (const doc of snap.docs) {
        const row = doc.data();
        const rowVariant = row.variant;
        if (rowVariant && rowVariant !== variant && rowVariant !== 'all') continue;
        const score = scoreContentRow(row, ctx) + (rowVariant === variant ? 2 : 0);
        if (score < 0) continue;
        if (score > bestScore) { bestScore = score; bestRows = [row]; }
        else if (score === bestScore) { bestRows.push(row); }
      }

      if (bestRows.length > 0) {
        const picked = bestRows[Math.floor(Math.random() * bestRows.length)];
        const result = picked.text || picked.cue || null;
        if (DEBUG_METADATA_RESOLUTION && result) {
          console.log(`[WorkoutMetadata] LogicCue (${variant}): "${result}" | score=${bestScore} | tied=${bestRows.length}`);
        }
        return result;
      }
    }
  } catch (error) {
    console.warn(`[WorkoutMetadata] fetchLogicCue error:`, error);
  }
  return null;
}

// ============================================================================
// MAIN RESOLVER
// ============================================================================

/**
 * Resolve workout metadata from Firestore.
 *
 * Fetches title, description, AI cue, and optionally a logic cue in parallel.
 * Falls back to null for each field if Firestore has no matching data
 * (the caller should use the WorkoutGenerator's hardcoded fallback in that case).
 */
export async function resolveWorkoutMetadata(
  ctx: WorkoutMetadataContext,
  variant?: TrioVariant,
  logicTagOverrides?: Pick<TagResolverContext, 'intensityReason' | 'challengeType' | 'equipmentAdaptation'>,
): Promise<ResolvedWorkoutMetadata> {
  try {
    const fetches: [
      Promise<string | null>,
      Promise<string | null>,
      Promise<string | null>,
      Promise<string | null>,
    ] = [
      fetchWorkoutTitle(ctx),
      fetchSmartDescription(ctx),
      fetchMotivationalPhrase(ctx),
      variant ? fetchLogicCue(ctx, variant) : Promise.resolve(null),
    ];

    const [title, description, aiCue, logicCue] = await Promise.all(fetches);

    const hasAnyFirestoreData = title || description || aiCue || logicCue;

    const tagCtx: TagResolverContext = {
      persona: ctx.persona || undefined,
      location: ctx.location,
      currentTime: new Date(),
      timeOfDay: ctx.timeOfDay === 'night' ? 'evening' : ctx.timeOfDay,
      userGender: ctx.gender,
      daysInactive: ctx.daysInactive,
      sportType: ctx.sportType,
      motivationStyle: ctx.motivationStyle,
      experienceLevel: ctx.experienceLevel,
      programProgress: ctx.programProgress,
      currentProgram: ctx.currentProgram || ctx.activeProgramId,
      targetLevel: ctx.targetLevel,
      distanceMeters: ctx.distanceMeters,
      estimatedArrivalMinutes: ctx.estimatedArrivalMinutes,
      durationMinutes: ctx.durationMinutes,
      difficulty: ctx.difficulty,
      dominantMuscle: ctx.dominantMuscle,
      categoryLabel: ctx.categoryLabel,
      category: ctx.category,
      runningBasePace: ctx.runningBasePace,
      targetDistanceLabel: ctx.targetDistanceLabel,
      programPhase: ctx.programPhase,
      ...logicTagOverrides,
    };

    return {
      title: title ? resolveContentTags(title, tagCtx) : null,
      description: description ? resolveContentTags(description, tagCtx) : null,
      aiCue: aiCue ? resolveContentTags(aiCue, tagCtx) : null,
      logicCue: logicCue ? resolveContentTags(logicCue, tagCtx) : null,
      source: hasAnyFirestoreData ? 'firestore' : 'fallback',
    };
  } catch (error) {
    console.warn('[WorkoutMetadata] Resolve failed, using fallback:', error);
    return { title: null, description: null, aiCue: null, logicCue: null, source: 'fallback' };
  }
}
