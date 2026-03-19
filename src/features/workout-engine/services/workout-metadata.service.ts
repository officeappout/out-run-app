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
  /** Current week number in the running plan (1-based) */
  weekNumber?: number;
  /** Total weeks in the running plan (for milestone detection) */
  totalWeeks?: number;

  // === Program Hierarchy Context ===
  /** Active Reserve flag — gives +2 to reservist-targeted content */
  isActiveReserve?: boolean;
  /** The user's currently active (child) program ID (e.g., 'push', 'pull') */
  activeProgramId?: string;
  /** The user's level within the active child program (from tracks) */
  programLevel?: number;
  /** IDs of all ancestor master programs (e.g., ['upper_body', 'full_body']) */
  ancestorProgramIds?: string[];

  // === Sub-Persona Context ===
  /** User's age in years (derived from birthDate) for sub-persona scoring */
  userAge?: number;

  // === Travel & Environment Context ===
  /** True when user is outside their home country (timezone !== Asia/Jerusalem or explicit flag) */
  isAbroad?: boolean;
  /** BundleIDs of the last 5 content pieces shown, for anti-repetition scoring */
  recentBundleIds?: string[];

  // === Strategic Coaching Context (for @פער_שבועי, @סיבת_רצף, etc.) ===
  /** Domain with the lowest weekly quota % (Hebrew name, e.g. "דחיפה") */
  weeklyGapDomain?: string;
  /** How far behind that domain is (0-100) */
  weeklyGapPercent?: number;
  /** User's consecutive training-day streak */
  streakDays?: number;
  /** Display name of today's progression step (e.g. "Diamond Push-ups 3×8") */
  currentProgressionStep?: string;
  /** Average rep count across workout exercises (for physiological focus tag) */
  avgRepCount?: number;
  /** Total sets completed this week */
  weeklyCompletedSets?: number;
  /** Defined weekly set quota (target) */
  weeklySetQuota?: number;
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
  /** BundleID of the winning title (if any) — for cross-content coherence */
  bundleId?: string;
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

/**
 * BUNDLE SYNC: When a Title with a bundleId is selected, subsequent fetches
 * (Description, Phrase, LogicCue) receive this boost for rows sharing the
 * same bundleId. This ensures all content pieces tell a coherent "story".
 */
const BUNDLE_SYNC_BOOST = 50;

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
/**
 * Persona values that target a specific demographic.
 * When the user has NO persona, content rows tagged with any of these
 * are hard-excluded so generic users never see "Young Mom" or "Senior" titles.
 */
const DEMOGRAPHIC_PERSONA_TAGS = new Set([
  'parent', 'mom', 'senior', 'high_tech', 'army', 'reservist', 'student',
]);

function scoreContentRow(row: any, ctx: WorkoutMetadataContext): number {
  let score = 0;

  // ── PERSONA-NEUTRAL GUARD ("David Clause") ──
  // If the user has NO persona defined, hard-exclude any content row that
  // targets a specific demographic persona. Only general, weather-based,
  // time-of-day, and difficulty-based content should survive.
  const rowPersona = row.persona;
  if (
    (!ctx.persona || ctx.persona === '') &&
    rowPersona &&
    rowPersona !== '' &&
    rowPersona !== 'any' &&
    DEMOGRAPHIC_PERSONA_TAGS.has(rowPersona)
  ) {
    return -1; // Hard exclude — no persona user must not see persona-specific content
  }

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
  // RESERVIST BOOST (+2)
  // ============================================================================
  // If the user has isActiveReserve=true and the row targets persona='reservist',
  // give a +2 boost (aligned with other contextual bonuses). This ensures
  // reservists see military-themed content without monopolizing the pool —
  // they'll also see relevant time-of-day, location, and progress content.
  if (ctx.isActiveReserve && row.persona === 'reservist') {
    score += 2;
  }

  // ============================================================================
  // YOUNG MOM SUB-PERSONA (+15 keyword boost)
  // ============================================================================
  // Female + parent persona + age <= 35 → "Young Mom" sub-persona.
  // Boost content that contains postpartum/toning keywords.
  const isYoungMom =
    ctx.gender === 'female' &&
    ctx.persona === 'parent' &&
    ctx.userAge !== undefined &&
    ctx.userAge <= 35;

  if (isYoungMom) {
    const rowText = (
      (row.text || '') + ' ' + (row.phrase || '') + ' ' + (row.description || '') + ' ' + (row.cue || '')
    ).toLowerCase();

    const YOUNG_MOM_KEYWORDS = ['חיטוב', 'בטן', 'רצפת אגן', 'אחרי הלילה'];
    const hasKeyword = YOUNG_MOM_KEYWORDS.some(kw => rowText.includes(kw));
    if (hasKeyword) {
      score += 15;
    }
  }

  // ============================================================================
  // PARENT TIME-WINDOW BOOST (+20)
  // ============================================================================
  // 08:00-09:00 = post-dropoff window → boost morning content
  // 16:00-17:30 = park/pickup window → boost afternoon content
  if (ctx.persona === 'parent') {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const minuteOfDay = h * 60 + m;

    const isPostDropoff = minuteOfDay >= 480 && minuteOfDay < 540;   // 08:00–09:00
    const isParkTime = minuteOfDay >= 960 && minuteOfDay < 1050;     // 16:00–17:30
    const rowTimeOfDay = row.timeOfDay;

    if (isPostDropoff && rowTimeOfDay === 'morning') {
      score += 20;
    }
    if (isParkTime && rowTimeOfDay === 'afternoon') {
      score += 20;
    }
  }

  // ============================================================================
  // DESK RESET BOOST (+30) — High-Tech & Students, 12:00-14:00
  // ============================================================================
  // During lunch hours, boost desk-friendly content for sedentary personas.
  if (ctx.persona === 'high_tech' || ctx.persona === 'student') {
    const deskNow = new Date();
    const deskH = deskNow.getHours();
    const isDeskWindow = deskH >= 12 && deskH < 14;

    if (isDeskWindow) {
      const rowText = (
        (row.text || '') + ' ' + (row.phrase || '') + ' ' +
        (row.description || '') + ' ' + (row.cue || '')
      ).toLowerCase();

      const DESK_KEYWORDS = ['כיסא', 'שולחן', 'משרד', 'ספרייה', 'מתיחות', 'עיניים'];
      if (DESK_KEYWORDS.some(kw => rowText.includes(kw))) {
        score += 30;
      }
    }
  }

  // ============================================================================
  // MIDDLE SCHOOL SUB-PERSONA (+20) — Students aged 13-15
  // ============================================================================
  const age = ctx.userAge;
  if (ctx.persona === 'student' && age !== undefined && age >= 13 && age <= 15) {
    const msText = (
      (row.text || '') + ' ' + (row.phrase || '') + ' ' +
      (row.description || '') + ' ' + (row.cue || '')
    ).toLowerCase();
    const MS_KEYWORDS = ['חטיבה', 'stats', 'גיימינג', 'gaming', 'reset'];
    if (MS_KEYWORDS.some(kw => msText.includes(kw))) {
      score += 20;
    }
  }

  // ============================================================================
  // HIGH SCHOOL & PRE-ARMY SUB-PERSONA (+20) — Students aged 16-19
  // ============================================================================
  if (ctx.persona === 'student' && age !== undefined && age >= 16 && age <= 19) {
    const hsText = (
      (row.text || '') + ' ' + (row.phrase || '') + ' ' +
      (row.description || '') + ' ' + (row.cue || '')
    ).toLowerCase();
    const HS_KEYWORDS = ['צבא', 'גיבוש', 'בגרות', 'academic weapon', 'physique', 'aesthetic', 'תיכון'];
    if (HS_KEYWORDS.some(kw => hsText.includes(kw))) {
      score += 20;
    }
  }

  // ============================================================================
  // SENIOR SUB-PERSONA (+25) — Age 65+ or senior persona
  // ============================================================================
  if (ctx.persona === 'senior' || (age !== undefined && age >= 65)) {
    const srText = (
      (row.text || '') + ' ' + (row.phrase || '') + ' ' +
      (row.description || '') + ' ' + (row.cue || '')
    ).toLowerCase();
    const SENIOR_KEYWORDS = ['מפרקים', 'נכדים', 'עצמאות', 'יציבות', 'בריאות', 'נחת'];
    if (SENIOR_KEYWORDS.some(kw => srText.includes(kw))) {
      score += 25;
    }
  }

  // ============================================================================
  // SEASONAL SCORING (+20) — Winter / Summer keyword boosts
  // ============================================================================
  const currentMonth = new Date().getMonth(); // 0-11
  const isWinter = currentMonth >= 10 || currentMonth <= 2;  // Nov–Mar
  const isSummer = currentMonth >= 5 && currentMonth <= 8;   // Jun–Sep

  if (isWinter || isSummer) {
    const seasonText = (
      (row.text || '') + ' ' + (row.phrase || '') + ' ' +
      (row.description || '') + ' ' + (row.cue || '')
    ).toLowerCase();

    if (isWinter) {
      const WINTER_KW = ['חורף', 'גשם', 'בית', 'סלון', 'קר'];
      if (WINTER_KW.some(kw => seasonText.includes(kw))) score += 20;
    }
    if (isSummer) {
      const SUMMER_KW = ['קיץ', 'ים', 'שמש', 'חיטוב', 'חם'];
      if (SUMMER_KW.some(kw => seasonText.includes(kw))) score += 20;
    }
  }

  // ============================================================================
  // AIRPORT BOOST (+35) — Travel-themed content at airports
  // ============================================================================
  if (ctx.location === 'airport') {
    const airText = (
      (row.text || '') + ' ' + (row.phrase || '') + ' ' +
      (row.description || '') + ' ' + (row.cue || '')
    ).toLowerCase();
    const AIRPORT_KW = ['טיסה', 'טרמינל', 'שדה תעופה', 'נחיתה', 'מטוס'];
    if (AIRPORT_KW.some(kw => airText.includes(kw))) score += 35;
  }

  // ============================================================================
  // ABROAD BOOST (+25) — User outside home country
  // ============================================================================
  const detectedAbroad = ctx.isAbroad ??
    (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Asia/Jerusalem');

  if (detectedAbroad) {
    const abroadText = (
      (row.text || '') + ' ' + (row.phrase || '') + ' ' +
      (row.description || '') + ' ' + (row.cue || '')
    ).toLowerCase();
    const ABROAD_KW = ['חו"ל', 'חופשה', 'טיול', 'בלי ציוד', 'רצף'];
    if (ABROAD_KW.some(kw => abroadText.includes(kw))) score += 25;
  }

  // ============================================================================
  // DIVERSITY PENALTY (-50) — Anti-repetition via recent bundleId history
  // ============================================================================
  const recentIds = ctx.recentBundleIds;
  if (recentIds && recentIds.length > 0 && row.bundleId) {
    if (recentIds.includes(row.bundleId)) {
      score -= 50;
    }
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

  // ============================================================================
  // RUNNING CATEGORY BOOST (+40) — Match content to running workout type
  // ============================================================================
  const userRunCat = ctx.runningCategory;
  if (userRunCat) {
    const rowRunCat = row.runningCategory;
    if (rowRunCat && rowRunCat === userRunCat) {
      score += 40;
    } else {
      const runCatText = (
        (row.text || '') + ' ' + (row.phrase || '') + ' ' +
        (row.description || '') + ' ' + (row.cue || '') + ' ' +
        (row.bundleId || '')
      ).toLowerCase();
      if (runCatText.includes(userRunCat.replace(/_/g, ' ')) || runCatText.includes(userRunCat)) {
        score += 40;
      }
    }
  }

  // ============================================================================
  // RUNNING PHASE BOOST (+30) — Match content to program phase
  // ============================================================================
  const userPhase = ctx.programPhase;
  if (userPhase) {
    const rowPhase = row.programPhase;
    if (rowPhase && rowPhase === userPhase) {
      score += 30;
    } else {
      const phaseText = (
        (row.text || '') + ' ' + (row.phrase || '') + ' ' +
        (row.description || '') + ' ' + (row.cue || '') + ' ' +
        (row.bundleId || '')
      ).toLowerCase();
      if (phaseText.includes(userPhase)) {
        score += 30;
      }
    }
  }

  // ============================================================================
  // PERSONA + RUNNING CATEGORY COMBO (+20)
  // ============================================================================
  // Double alignment: content targets both the user's persona AND category.
  if (userRunCat && ctx.persona) {
    const rowPersona = row.persona;
    const rowRunCategory = row.runningCategory;
    if (rowPersona && rowRunCategory && rowPersona === ctx.persona && rowRunCategory === userRunCat) {
      score += 20;
    }
  }

  // ============================================================================
  // WEEK NUMBER BOOST (+25) — Milestone content targeting
  // ============================================================================
  // Boost content whose weekNumber field matches, OR whose text contains
  // milestone keywords when the user is at a relevant point in the plan.
  const wk = ctx.weekNumber;
  if (wk !== undefined) {
    // Field match: row explicitly targets this week
    const rowWeek = row.weekNumber;
    if (rowWeek !== undefined && Number(rowWeek) === wk) {
      score += 25;
    }

    // Keyword match: midpoint & finish content
    const total = ctx.totalWeeks ?? 0;
    const isFirstWeek = wk === 1;
    const isMidpoint = total > 0 && wk === Math.ceil(total / 2);
    const isFinalWeek = total > 0 && wk >= total;

    if (isFirstWeek || isMidpoint || isFinalWeek) {
      const wkText = (
        (row.text || '') + ' ' + (row.phrase || '') + ' ' +
        (row.description || '') + ' ' + (row.cue || '')
      ).toLowerCase();

      const MILESTONE_KW: Record<string, string[]> = {
        first:  ['שבוע ראשון', 'התחלה', 'יוצאים לדרך'],
        mid:    ['חצי דרך', 'אמצע', 'חציון'],
        final:  ['סיום', 'שבוע אחרון', 'קו הסיום', 'הגענו'],
      };

      const activeKw = [
        ...(isFirstWeek ? MILESTONE_KW.first : []),
        ...(isMidpoint ? MILESTONE_KW.mid : []),
        ...(isFinalWeek ? MILESTONE_KW.final : []),
      ];
      if (activeKw.some(kw => wkText.includes(kw))) {
        score += 25;
      }
    }
  }

  // ============================================================================
  // WEEK-PHASE AWARENESS (+15) — Late-plan boost for peak/taper content
  // ============================================================================
  // If the user is deep into the plan (week > 8), boost peak-phase content.
  // If in final 2 weeks, boost taper content.
  if (wk !== undefined && wk > 8) {
    const rowPhaseForWeek = row.programPhase;
    if (rowPhaseForWeek === 'peak') {
      score += 15;
    }
    const total = ctx.totalWeeks ?? 0;
    if (total > 0 && wk >= total - 1 && rowPhaseForWeek === 'taper') {
      score += 15;
    }
  }

  return score;
}

/**
 * Build human-readable match reasons for a winning row (for debug logging).
 */
function getMatchReasons(row: any, ctx: WorkoutMetadataContext): string[] {
  const reasons: string[] = [];

  // Persona-neutral guard debug
  const rp = row.persona;
  if ((!ctx.persona || ctx.persona === '') && rp && rp !== '' && rp !== 'any' && DEMOGRAPHIC_PERSONA_TAGS.has(rp)) {
    reasons.push(`persona_neutral_EXCLUDED(row=${rp})`);
  }

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
  if (ctx.isActiveReserve && row.persona === 'reservist') reasons.push('reservist(+2)');

  // Young Mom sub-persona
  const isYoungMomDebug = ctx.gender === 'female' && ctx.persona === 'parent' && ctx.userAge !== undefined && ctx.userAge <= 35;
  if (isYoungMomDebug) {
    const debugText = ((row.text || '') + ' ' + (row.phrase || '') + ' ' + (row.description || '') + ' ' + (row.cue || '')).toLowerCase();
    if (['חיטוב', 'בטן', 'רצפת אגן', 'אחרי הלילה'].some(kw => debugText.includes(kw))) {
      reasons.push('youngMom_keyword(+15)');
    }
  }

  // Parent time-window
  if (ctx.persona === 'parent') {
    const nowDbg = new Date();
    const mod = nowDbg.getHours() * 60 + nowDbg.getMinutes();
    if (mod >= 480 && mod < 540 && row.timeOfDay === 'morning') reasons.push('parentDropoff(+20)');
    if (mod >= 960 && mod < 1050 && row.timeOfDay === 'afternoon') reasons.push('parentPark(+20)');
  }

  // Desk Reset
  if (ctx.persona === 'high_tech' || ctx.persona === 'student') {
    const deskDbgH = new Date().getHours();
    if (deskDbgH >= 12 && deskDbgH < 14) {
      const deskDbgText = ((row.text || '') + ' ' + (row.phrase || '') + ' ' + (row.description || '') + ' ' + (row.cue || '')).toLowerCase();
      if (['כיסא', 'שולחן', 'משרד', 'ספרייה', 'מתיחות', 'עיניים'].some(kw => deskDbgText.includes(kw))) {
        reasons.push('deskReset_boost(+30)');
      }
    }
  }

  // Age-based sub-persona debug reasons
  const dbgAge = ctx.userAge;
  if (dbgAge !== undefined) {
    const ageText = ((row.text || '') + ' ' + (row.phrase || '') + ' ' + (row.description || '') + ' ' + (row.cue || '')).toLowerCase();
    if (ctx.persona === 'student' && dbgAge >= 13 && dbgAge <= 15) {
      if (['חטיבה', 'stats', 'גיימינג', 'gaming', 'reset'].some(kw => ageText.includes(kw))) {
        reasons.push('middleSchool_boost(+20)');
      }
    }
    if (ctx.persona === 'student' && dbgAge >= 16 && dbgAge <= 19) {
      if (['צבא', 'גיבוש', 'בגרות', 'academic weapon', 'physique', 'aesthetic', 'תיכון'].some(kw => ageText.includes(kw))) {
        reasons.push('armyPrep_boost(+20)');
      }
    }
    if (ctx.persona === 'senior' || dbgAge >= 65) {
      if (['מפרקים', 'נכדים', 'עצמאות', 'יציבות', 'בריאות', 'נחת'].some(kw => ageText.includes(kw))) {
        reasons.push('senior_boost(+25)');
      }
    }
  }

  // Seasonal, Airport, Abroad, Diversity
  const dbgMonth = new Date().getMonth();
  const dbgIsWinter = dbgMonth >= 10 || dbgMonth <= 2;
  const dbgIsSummer = dbgMonth >= 5 && dbgMonth <= 8;
  if (dbgIsWinter || dbgIsSummer) {
    const seasonDbgText = ((row.text || '') + ' ' + (row.phrase || '') + ' ' + (row.description || '') + ' ' + (row.cue || '')).toLowerCase();
    if (dbgIsWinter && ['חורף', 'גשם', 'בית', 'סלון', 'קר'].some(kw => seasonDbgText.includes(kw))) {
      reasons.push('winter_boost(+20)');
    }
    if (dbgIsSummer && ['קיץ', 'ים', 'שמש', 'חיטוב', 'חם'].some(kw => seasonDbgText.includes(kw))) {
      reasons.push('summer_boost(+20)');
    }
  }
  if (ctx.location === 'airport') {
    const airDbgText = ((row.text || '') + ' ' + (row.phrase || '') + ' ' + (row.description || '') + ' ' + (row.cue || '')).toLowerCase();
    if (['טיסה', 'טרמינל', 'שדה תעופה', 'נחיתה', 'מטוס'].some(kw => airDbgText.includes(kw))) {
      reasons.push('airport_boost(+35)');
    }
  }
  const dbgAbroad = ctx.isAbroad ?? (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Asia/Jerusalem');
  if (dbgAbroad) {
    const abroadDbgText = ((row.text || '') + ' ' + (row.phrase || '') + ' ' + (row.description || '') + ' ' + (row.cue || '')).toLowerCase();
    if (['חו"ל', 'חופשה', 'טיול', 'בלי ציוד', 'רצף'].some(kw => abroadDbgText.includes(kw))) {
      reasons.push('abroad_boost(+25)');
    }
  }
  if (ctx.recentBundleIds?.length && row.bundleId && ctx.recentBundleIds.includes(row.bundleId)) {
    reasons.push('diversity_penalty(-50)');
  }

  // Running scoring debug
  if (ctx.runningCategory) {
    const rcMatch = row.runningCategory === ctx.runningCategory;
    if (!rcMatch) {
      const rcText = ((row.text || '') + ' ' + (row.phrase || '') + ' ' + (row.description || '') + ' ' + (row.cue || '') + ' ' + (row.bundleId || '')).toLowerCase();
      const rcKey = ctx.runningCategory.replace(/_/g, ' ');
      if (rcText.includes(rcKey) || rcText.includes(ctx.runningCategory)) {
        reasons.push(`runCategory_boost(+40,text)`);
      }
    } else {
      reasons.push(`runCategory_boost(+40,field)`);
    }
  }
  if (ctx.programPhase) {
    const rpMatch = row.programPhase === ctx.programPhase;
    if (!rpMatch) {
      const rpText = ((row.text || '') + ' ' + (row.phrase || '') + ' ' + (row.description || '') + ' ' + (row.cue || '') + ' ' + (row.bundleId || '')).toLowerCase();
      if (rpText.includes(ctx.programPhase)) {
        reasons.push(`runPhase_boost(+30,text)`);
      }
    } else {
      reasons.push(`runPhase_boost(+30,field)`);
    }
  }
  if (ctx.runningCategory && ctx.persona && row.persona === ctx.persona && row.runningCategory === ctx.runningCategory) {
    reasons.push(`runCombo_boost(+20)`);
  }

  // Week number debug
  const dbgWk = ctx.weekNumber;
  if (dbgWk !== undefined) {
    if (row.weekNumber !== undefined && Number(row.weekNumber) === dbgWk) {
      reasons.push(`weekNumber_boost(+25,field=w${dbgWk})`);
    }
    const dbgTotal = ctx.totalWeeks ?? 0;
    const dbgFirst = dbgWk === 1;
    const dbgMid = dbgTotal > 0 && dbgWk === Math.ceil(dbgTotal / 2);
    const dbgFinal = dbgTotal > 0 && dbgWk >= dbgTotal;
    if (dbgFirst || dbgMid || dbgFinal) {
      const wkDbgText = ((row.text || '') + ' ' + (row.phrase || '') + ' ' + (row.description || '') + ' ' + (row.cue || '')).toLowerCase();
      const msKw = [
        ...(dbgFirst ? ['שבוע ראשון', 'התחלה', 'יוצאים לדרך'] : []),
        ...(dbgMid ? ['חצי דרך', 'אמצע', 'חציון'] : []),
        ...(dbgFinal ? ['סיום', 'שבוע אחרון', 'קו הסיום', 'הגענו'] : []),
      ];
      if (msKw.some(kw => wkDbgText.includes(kw))) {
        reasons.push(`weekNumber_boost(+25,milestone=w${dbgWk}/${dbgTotal})`);
      }
    }
    if (dbgWk > 8) {
      if (row.programPhase === 'peak') reasons.push('weekPhase_boost(+15,peak)');
      if (dbgTotal > 0 && dbgWk >= dbgTotal - 1 && row.programPhase === 'taper') reasons.push('weekPhase_boost(+15,taper)');
    }
  }

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

interface ScoredFetchResult {
  text: string | null;
  bundleId?: string;
}

/**
 * Generic scored fetch: load all rows from a subcollection,
 * score each against the context, pick the highest, shuffle among ties.
 *
 * @param parentDoc      Parent doc path (e.g., 'workoutTitles')
 * @param subCol         Subcollection name (e.g., 'titles')
 * @param textField      The field that contains the user-facing string
 * @param ctx            The user's metadata context
 * @param activeBundleId If set, rows sharing this bundleId get +BUNDLE_SYNC_BOOST
 */
async function scoredFetch(
  parentDoc: string,
  subCol: string,
  textField: string,
  ctx: WorkoutMetadataContext,
  activeBundleId?: string,
): Promise<ScoredFetchResult> {
  try {
    const ref = collection(db, METADATA_BASE, parentDoc, subCol);
    const snap = await getDocs(ref);
    if (snap.empty) return { text: null };

    const allRows = snap.docs.map(d => d.data());

    let bestScore = -1;
    let bestRows: any[] = [];

    for (const row of allRows) {
      let score = scoreContentRow(row, ctx);
      if (score < 0) continue;

      if (activeBundleId && row.bundleId && row.bundleId === activeBundleId) {
        score += BUNDLE_SYNC_BOOST;
      }

      if (score > bestScore) {
        bestScore = score;
        bestRows = [row];
      } else if (score === bestScore) {
        bestRows.push(row);
      }
    }

    if (bestRows.length === 0) return { text: null };

    const picked = bestRows[Math.floor(Math.random() * bestRows.length)];
    const result = picked[textField] || null;

    if (DEBUG_METADATA_RESOLUTION && result) {
      const contentType = parentDoc === 'workoutTitles' ? 'Title' : parentDoc === 'smartDescriptions' ? 'Description' : 'Phrase';
      const reasons = getMatchReasons(picked, ctx);
      if (activeBundleId && picked.bundleId === activeBundleId) {
        reasons.push(`bundleSync=${activeBundleId}(+${BUNDLE_SYNC_BOOST})`);
      }
      console.group(`[WorkoutMetadata] ${contentType} resolution`);
      console.log(`Result: "${result}"`);
      console.log(`Score: ${bestScore} | Tied rows: ${bestRows.length}${picked.bundleId ? ` | bundleId: ${picked.bundleId}` : ''}`);
      console.log(`Why chosen: ${reasons.length ? reasons.join('; ') : '(base score only)'}`);
      console.groupEnd();
    }

    return { text: result, bundleId: picked.bundleId };
  } catch (error) {
    console.warn(`[WorkoutMetadata] Error in scoredFetch(${parentDoc}/${subCol}):`, error);
    return { text: null };
  }
}

// ============================================================================
// FETCH WRAPPERS (delegate to Scoring Engine)
// ============================================================================

async function fetchWorkoutTitle(ctx: WorkoutMetadataContext): Promise<ScoredFetchResult> {
  return scoredFetch('workoutTitles', TITLES_SUBCOLLECTION, 'text', ctx);
}

async function fetchSmartDescription(ctx: WorkoutMetadataContext, activeBundleId?: string): Promise<ScoredFetchResult> {
  return scoredFetch('smartDescriptions', DESCRIPTIONS_SUBCOLLECTION, 'description', ctx, activeBundleId);
}

async function fetchMotivationalPhrase(ctx: WorkoutMetadataContext, activeBundleId?: string): Promise<ScoredFetchResult> {
  return scoredFetch('motivationalPhrases', PHRASES_SUBCOLLECTION, 'phrase', ctx, activeBundleId);
}

/**
 * Fetch a logic cue from `workoutMetadata/logicCues/cues`.
 * Rows are scored like other metadata but also filtered by `variant`.
 * If no Firestore data exists, returns a computed fallback.
 */
async function fetchLogicCue(
  ctx: WorkoutMetadataContext,
  variant: TrioVariant,
  activeBundleId?: string,
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
        let score = scoreContentRow(row, ctx) + (rowVariant === variant ? 2 : 0);
        if (score < 0) continue;
        if (activeBundleId && row.bundleId && row.bundleId === activeBundleId) {
          score += BUNDLE_SYNC_BOOST;
        }
        if (score > bestScore) { bestScore = score; bestRows = [row]; }
        else if (score === bestScore) { bestRows.push(row); }
      }

      if (bestRows.length > 0) {
        const picked = bestRows[Math.floor(Math.random() * bestRows.length)];
        const result = picked.text || picked.cue || null;
        if (DEBUG_METADATA_RESOLUTION && result) {
          const bundleNote = activeBundleId && picked.bundleId === activeBundleId ? ` | bundle=${activeBundleId}(+${BUNDLE_SYNC_BOOST})` : '';
          console.log(`[WorkoutMetadata] LogicCue (${variant}): "${result}" | score=${bestScore} | tied=${bestRows.length}${bundleNote}`);
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
/**
 * Resolve workout metadata from Firestore.
 *
 * Two-pass Bundle Sync strategy:
 *   Pass 1 — Fetch the Title (no bundle context yet). Extract its bundleId.
 *   Pass 2 — Fetch Description, Phrase, and LogicCue in parallel, passing
 *            the winning Title's bundleId so rows with the same ID get +50.
 *
 * This ensures all content pieces tell a coherent "story" when bundled
 * content exists in Firestore, while gracefully degrading to independent
 * scoring when no bundleId is present.
 */
export async function resolveWorkoutMetadata(
  ctx: WorkoutMetadataContext,
  variant?: TrioVariant,
  logicTagOverrides?: Pick<TagResolverContext, 'intensityReason' | 'challengeType' | 'equipmentAdaptation'>,
): Promise<ResolvedWorkoutMetadata> {
  try {
    // ── Pass 1: Title (anchor for bundle sync) ──
    const titleResult = await fetchWorkoutTitle(ctx);
    const activeBundleId = titleResult.bundleId;

    if (DEBUG_METADATA_RESOLUTION && activeBundleId) {
      console.log(`[WorkoutMetadata] Bundle anchor: "${activeBundleId}" — syncing Description, Phrase, LogicCue`);
    }

    // ── Pass 2: Remaining content with bundle boost ──
    const [descriptionResult, phraseResult, logicCue] = await Promise.all([
      fetchSmartDescription(ctx, activeBundleId),
      fetchMotivationalPhrase(ctx, activeBundleId),
      variant ? fetchLogicCue(ctx, variant, activeBundleId) : Promise.resolve(null),
    ]);

    const title = titleResult.text;
    const description = descriptionResult.text;
    const aiCue = phraseResult.text;
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
      runningCategory: ctx.runningCategory,
      weekNumber: ctx.weekNumber,
      totalWeeks: ctx.totalWeeks,
      // Strategic coaching tags
      weeklyGapDomain: ctx.weeklyGapDomain,
      weeklyGapPercent: ctx.weeklyGapPercent,
      streakDays: ctx.streakDays,
      currentProgressionStep: ctx.currentProgressionStep,
      avgRepCount: ctx.avgRepCount,
      weeklyCompletedSets: ctx.weeklyCompletedSets,
      weeklySetQuota: ctx.weeklySetQuota,
      ...logicTagOverrides,
    };

    return {
      title: title ? resolveContentTags(title, tagCtx) : null,
      description: description ? resolveContentTags(description, tagCtx) : null,
      aiCue: aiCue ? resolveContentTags(aiCue, tagCtx) : null,
      logicCue: logicCue ? resolveContentTags(logicCue, tagCtx) : null,
      source: hasAnyFirestoreData ? 'firestore' : 'fallback',
      bundleId: activeBundleId,
    };
  } catch (error) {
    console.warn('[WorkoutMetadata] Resolve failed, using fallback:', error);
    return { title: null, description: null, aiCue: null, logicCue: null, source: 'fallback' };
  }
}
