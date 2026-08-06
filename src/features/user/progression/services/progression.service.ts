/**
 * Progression Service
 * Handles domain-specific progression tracking with unified master program view
 * 
 * Key Features:
 * - Base session gain per level
 * - Bonus percentage for exceeding target reps
 * - Linked programs (multi-program progression)
 * - Ready for Split detection
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserFullProfile, TrainingDomainId } from '../../core/types/user.types';
import {
  ProgressionRule, 
  DomainTrackProgress, 
  MasterProgramProgress,
  WorkoutCompletionData,
  WorkoutCompletionResult,
  WorkoutExerciseResult,
  ReadyForSplitStatus,
  VolumeBreakdown,
  DEFAULT_PROGRESSION_BY_LEVEL,
  LinkedProgramConfig,
  getDefaultRequiredSets,
  LevelEquivalenceRule,
  LevelEquivalenceResult,
  ChildDomainGain,
} from '../../core/types/progression.types';
import { Program } from '@/features/content/programs';
import { getProgram, getAllPrograms, getProgramByTemplateId, MASTER_PROGRAM_SLUG_TO_ID, MASTER_PROGRAM_ID_TO_SLUG } from '@/features/content/programs';

/**
 * Resolve a programId against the `programs` Firestore collection BEFORE
 * we persist it into `progression.activePrograms[].templateId`. Mirrors
 * the validation in `onboarding-sync.service.ts` — see that file for
 * the full rationale (the legendary "פ" templateId bug). Centralised
 * locally rather than imported to avoid a new client→client coupling.
 *
 * Returns false on:
 *   • non-string / empty input
 *   • slug-shape mismatch (catches single-character / non-ASCII junk
 *     before spending a Firestore read)
 *   • getProgramByTemplateId returns null (id doesn't resolve)
 *   • getProgramByTemplateId throws (network / permission error)
 */
async function isValidProgramTemplateId(templateId: unknown): Promise<boolean> {
  if (typeof templateId !== 'string' || templateId.trim() === '') {
    return false;
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(templateId)) {
    return false;
  }
  try {
    const program = await getProgramByTemplateId(templateId);
    return program !== null;
  } catch (err) {
    console.warn(
      '[Progression] programId validation threw — treating as invalid:',
      templateId, err,
    );
    return false;
  }
}
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';
import { getExercise } from '@/features/content/exercises/core/exercise.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { LevelGoal } from '@/types/workout';

const PROGRAM_LEVEL_SETTINGS_COLLECTION = 'program_level_settings';
const PROGRESSION_RULES_COLLECTION = 'progression_rules';
const LEVEL_EQUIVALENCE_COLLECTION = 'level_equivalence_rules';
const PROGRAMS_COLLECTION = 'programs';
const USERS_COLLECTION = 'users';

// Threshold for "Ready for Split" recommendation (Full Body → Upper/Lower)
const READY_FOR_SPLIT_LEVEL = 13;
const READY_FOR_SPLIT_PROGRAMS = ['full_body'];

/**
 * Hardcoded known master programs as a bulletproof fallback.
 * Used when the Firestore document lookup by ID fails (e.g., when the
 * activeProgramId is a slug like "full_body" but the Firestore document
 * was created with an auto-generated ID via addDoc).
 */
export const KNOWN_MASTER_PROGRAMS: Record<string, string[]> = {
  full_body: ['push', 'pull', 'legs', 'core'],
  upper_body: ['push', 'pull'],
  lower_body: ['legs', 'core'],
};

/**
 * Resolve Firestore program IDs to human-readable slugs.
 *
 * Fetches all programs once, then builds two maps:
 *   - idToSlug: Firestore ID → slug (e.g. "H2279Xs..." → "legs")
 *   - slugToId: slug → Firestore ID (reverse lookup)
 *
 * Slug priority:
 *   1. movementPattern (admin-defined: 'push' | 'pull' | 'legs' | 'core')
 *   2. Lowercased/underscored name (e.g. "Full Body" → "full_body")
 */
interface ProgramSlugMap {
  idToSlug: Map<string, string>;
  slugToId: Map<string, string>;
  idToProgram: Map<string, Program>;
}

async function buildProgramSlugMap(): Promise<ProgramSlugMap> {
  const allPrograms = await getAllPrograms();
  const idToSlug = new Map<string, string>();
  const slugToId = new Map<string, string>();
  const idToProgram = new Map<string, Program>();

  for (const p of allPrograms) {
    const slug = p.movementPattern || p.name.toLowerCase().replace(/[\s-]+/g, '_');
    idToSlug.set(p.id, slug);
    slugToId.set(slug, p.id);
    idToProgram.set(p.id, p);
  }

  return { idToSlug, slugToId, idToProgram };
}

/**
 * Convert Firestore timestamp to Date
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
 * Initialize default track progress for a domain
 */
function getDefaultTrackProgress(): DomainTrackProgress {
  return {
    currentLevel: 1,
    percent: 0,
  };
}

/**
 * Ensure progression.tracks exists and initialize missing domains
 */
function ensureTracksInitialized(progression: UserFullProfile['progression']): void {
  if (!progression.tracks) {
    progression.tracks = {};
  }
}

/**
 * Get ProgressionRule for a specific program and level
 */
async function getProgressionRule(
  programId: string,
  level: number
): Promise<ProgressionRule | null> {
  try {
    const q = query(
      collection(db, PROGRAM_LEVEL_SETTINGS_COLLECTION),
      where('programId', '==', programId),
      where('level', '==', level)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as ProgressionRule;
  } catch (error) {
    console.error(`Error fetching progression rule for ${programId} level ${level}:`, error);
    return null;
  }
}

/**
 * Update user progression tracks in Firestore.
 * Also mirrors currentLevel into progression.domains so the Home
 * dashboard reads consistent data from both paths.
 */
async function updateProgressionTracks(
  userId: string,
  tracks: { [programId: string]: DomainTrackProgress }
): Promise<boolean> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);

    // Build domain-level mirror updates so progression.domains stays in sync
    // Mirror BOTH currentLevel AND percent to prevent stale reads
    const domainMirror: Record<string, unknown> = {};
    for (const [programId, track] of Object.entries(tracks)) {
      domainMirror[`progression.domains.${programId}.currentLevel`] = track.currentLevel;
      if (track.percent != null) {
        domainMirror[`progression.domains.${programId}.percent`] = track.percent;
      }
    }

    await updateDoc(userDocRef, {
      'progression.tracks': tracks,
      ...domainMirror,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating progression tracks:', error);
    return false;
  }
}

/**
 * Calculate session progress for exercises
 * 
 * @param userId - User ID
 * @param exercises - Array of exercises with programId (string or string[]), reps, and targetReps
 * @returns Promise<boolean> - Success status
 */
export async function calculateSessionProgress(
  userId: string,
  exercises: { programId: string | string[]; reps: number; targetReps: number }[]
): Promise<boolean> {
  try {
    // Fetch user profile
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error('User not found:', userId);
      return false;
    }

    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;

    // Ensure tracks are initialized
    ensureTracksInitialized(progression);

    // Group exercises by domain
    const domainPerformance: Record<string, { totalReps: number; totalTargetReps: number; count: number }> = {};

    for (const exercise of exercises) {
      const programIds = Array.isArray(exercise.programId) ? exercise.programId : [exercise.programId];

      for (const programId of programIds) {
        if (!domainPerformance[programId]) {
          domainPerformance[programId] = {
            totalReps: 0,
            totalTargetReps: 0,
            count: 0,
          };
        }

        domainPerformance[programId].totalReps += exercise.reps;
        domainPerformance[programId].totalTargetReps += exercise.targetReps;
        domainPerformance[programId].count += 1;
      }
    }

    // Calculate average performance per domain and apply bonuses
    const updatedTracks = { ...progression.tracks };

    for (const [domain, performance] of Object.entries(domainPerformance)) {
      // Calculate average performance percentage
      const avgPerformance = performance.totalTargetReps > 0
        ? (performance.totalReps / performance.totalTargetReps) * 100
        : 0;

      // Initialize track if missing
      if (!updatedTracks[domain]) {
        updatedTracks[domain] = getDefaultTrackProgress();
      }

      const track = updatedTracks[domain];
      const currentLevel = track.currentLevel;

      // Fetch progression rule for bonus calculation
      const rule = await getProgressionRule(domain, currentLevel);
      const bonusPercent = rule?.bonusPercent || 0;

      // Calculate base progress (average performance as percentage)
      // Cap at 100% to prevent over-performance from giving excessive progress
      const baseProgress = Math.min(avgPerformance, 100);
      
      // Apply bonus: bonusPercent is a multiplier (e.g., 10 = 10% bonus)
      // Example: 80% performance with 10% bonus = 80% * 1.10 = 88% total progress
      const bonusAmount = (baseProgress * bonusPercent) / 100;
      const totalProgress = baseProgress + bonusAmount;

      // Add to existing percent
      track.percent = Math.min(track.percent + totalProgress, 100);

      // Check for level-up
      if (track.percent >= 100) {
        track.currentLevel += 1;
        track.percent = 0; // Reset percent after level-up
      }

      updatedTracks[domain] = track;
    }

    // Update Firestore
    await updateProgressionTracks(userId, updatedTracks);

    // Also update local progression object for consistency
    progression.tracks = updatedTracks;

    // ✅ Recalculate ancestor master programs for each updated domain
    try {
      for (const domain of Object.keys(domainPerformance)) {
        await recalculateAncestorMasters(userId, domain);
      }
    } catch (e) {
      console.error('[Progression] Failed to recalculate masters after session:', e);
    }

    return true;
  } catch (error) {
    console.error('Error calculating session progress:', error);
    return false;
  }
}

/**
 * Get master program progress (unified view) — recursive.
 * If a sub-program is itself a master program, its level is resolved recursively
 * before averaging. This supports multi-level hierarchies:
 *   Full Body → Upper Body (master) → Push / Pull
 *
 * @param userId - User ID
 * @param masterProgramId - Master program ID (e.g., "full_body")
 * @param _programCache - (internal) avoid re-fetching the same program
 * @param _slugMap - (internal) pre-built slug map; built once at top level and
 *   passed down to recursive calls to avoid repeated getAllPrograms() fetches
 * @returns Promise<MasterProgramProgress | null>
 */
export async function getMasterProgramProgress(
  userId: string,
  masterProgramId: string,
  _programCache?: Map<string, Program | null>,
  _slugMap?: ProgramSlugMap | null,
): Promise<MasterProgramProgress | null> {
  const programCache = _programCache ?? new Map<string, Program | null>();

  try {
    // ── Defense A: build a definitive hash→slug map once per call chain ────
    // processBottomUpMasterCompletion already uses buildProgramSlugMap() for
    // child classification. Injecting it here gives getMasterProgramProgress
    // the same reliable ID→slug resolution so that skill programs stored under
    // Firestore hash IDs in `subPrograms[]` are correctly mapped to the slug
    // keys ('planche', 'front_lever', …) used by `progression.tracks`.
    let slugMap: ProgramSlugMap | null = _slugMap ?? null;
    if (slugMap === null && _slugMap === undefined) {
      try {
        slugMap = await buildProgramSlugMap();
      } catch (e) {
        console.warn('[Progression] getMasterProgramProgress: slug map build failed — falling back to field-based resolution:', e);
      }
    }

    // Fetch master program (use cache to prevent N+1 in recursive calls)
    let masterProgram = programCache.get(masterProgramId);
    if (masterProgram === undefined) {
      masterProgram = await getProgram(masterProgramId);
      programCache.set(masterProgramId, masterProgram ?? null);
    }
    if (!masterProgram || !masterProgram.isMaster) {
      console.error('Master program not found or not a master program:', masterProgramId);
      return null;
    }

    // Fetch user profile
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error('User not found:', userId);
      return null;
    }

    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;

    // Ensure tracks are initialized
    ensureTracksInitialized(progression);

    // ── Defense B (prep): read current master level BEFORE overwriting it ──
    // Extracted here from the already-loaded user doc so recalculateMasterLevel
    // can apply a monotonic floor without a second Firestore round-trip.
    const masterSlugForPrior =
      masterProgram?.slug ||
      masterProgram?.movementPattern ||
      MASTER_PROGRAM_ID_TO_SLUG[masterProgramId] ||
      masterProgramId;
    const priorMasterRawTrack =
      progression.tracks?.[masterProgramId] ??
      progression.tracks?.[masterSlugForPrior];
    const priorMasterLevel =
      (priorMasterRawTrack as { currentLevel?: number } | undefined)?.currentLevel ?? 0;

    // Get sub-programs
    const subProgramIds = masterProgram.subPrograms || [];
    if (subProgramIds.length === 0) {
      console.warn('Master program has no sub-programs:', masterProgramId);
      return null;
    }

    // Resolve each sub-program — may recurse if the child is also a master
    const subPrograms: { programId: string; level: number; percent: number }[] = [];
    let totalLevel = 0;
    let totalPercent = 0;

    // Track which child slugs/IDs have real questionnaire data so unconfigured
    // children (level === 0 or absent track) are excluded from both the
    // numerator AND denominator when computing the master average.
    //
    // Without this guard a pull-only user (pull=L16, push=absent) would produce:
    //   upper_body = avg(pull=16, push=1_default) = 8   ← wrong
    // With this guard:
    //   upper_body = avg(pull=16) / 1               = 16  ← correct
    const configuredChildIds = new Set<string>();

    for (const subProgramId of subProgramIds) {
      // Check if the sub-program is itself a master (multi-level hierarchy)
      let childProgram = programCache.get(subProgramId);
      if (childProgram === undefined) {
        childProgram = await getProgram(subProgramId);
        programCache.set(subProgramId, childProgram ?? null);
      }

      if (childProgram?.isMaster) {
        // Recursive: calculate the child-master's aggregated level.
        // displayLevel > 0 only when at least one leaf within the child master
        // is configured; treat 0 as "unconfigured" and exclude from average.
        // Pass slugMap and programCache down to avoid rebuilding them.
        const childMasterProgress = await getMasterProgramProgress(userId, subProgramId, programCache, slugMap);
        const level = childMasterProgress?.displayLevel ?? 0;
        const percent = childMasterProgress?.displayPercent ?? 0;
        subPrograms.push({ programId: subProgramId, level, percent });
        totalLevel += level;
        totalPercent += percent;
        if (level > 0) configuredChildIds.add(subProgramId);
      } else {
        // Leaf child — resolve hash ID → slug before reading tracks.
        // Workout completion writes child tracks under slug keys ('push', 'pull', etc.)
        // not Firestore hash IDs, so we must look up by slug first.
        //
        // ── Defense A: slug resolution priority order ─────────────────────
        //   1. buildProgramSlugMap() idToSlug (most reliable — iterates all
        //      Firestore program docs; covers slug, movementPattern, name).
        //      This eliminates Mode A/B/C routing gaps where skill programs
        //      stored under hash IDs collapsed to their movementPattern
        //      ('push'/'pull') instead of their skill slug ('planche').
        //   2. subProgramId directly, IF the user already has a granular track
        //      keyed to that ID (e.g. progression.tracks['planche'] = L7).
        //   3. childProgram?.slug (admin-set canonical slug field)
        //   4. MASTER_PROGRAM_ID_TO_SLUG static map (Firestore hash → slug)
        //   5. childProgram?.movementPattern (foundational programs without slug)
        //   6. subProgramId as-is (last resort)
        const mapResolvedSlug = slugMap?.idToSlug.get(subProgramId);
        const hasOwnTrack =
          progression.tracks?.[subProgramId] != null &&
          ((progression.tracks[subProgramId] as { currentLevel?: number })?.currentLevel ?? 0) > 0;
        const childSlug =
          mapResolvedSlug ||
          (hasOwnTrack ? subProgramId : undefined) ||
          childProgram?.slug ||
          MASTER_PROGRAM_ID_TO_SLUG[subProgramId] ||
          childProgram?.movementPattern ||
          subProgramId;
        const rawTrack = progression.tracks?.[childSlug] ?? progression.tracks?.[subProgramId];
        // A child is "configured" when its track exists AND carries a real level
        // (level > 0).  An absent track or a track at level 0 means the user
        // never assessed this domain — it must NOT contribute to the average.
        const isConfigured = rawTrack != null && (rawTrack.currentLevel ?? 0) > 0;
        const track = rawTrack ?? getDefaultTrackProgress();
        subPrograms.push({
          programId: childSlug, // use slug so EXCLUDED_FROM_AVG comparison works
          level: track.currentLevel,
          percent: track.percent,
        });
        totalLevel += track.currentLevel;
        totalPercent += track.percent;
        if (isConfigured) configuredChildIds.add(childSlug);
      }
    }

    // Master level = Avg of CONFIGURED child tracks, with per-master exclusions
    // and caps.  full_body: Avg(push, pull, legs) — core excluded, capped at 15.
    //
    // "Configured" = child has a real track with level > 0 (assessed by the user).
    // Unconfigured children are excluded from both the sum and the denominator so
    // a pull-only user (pull=L16, push=absent) gets upper_body=L16 rather than
    // upper_body=avg(16, 1_ghost)/2=L8.
    //
    // masterProgramId may arrive as a Firestore hash — normalise to slug so the
    // map lookups below work regardless of which form the caller used.
    const masterSlug =
      masterProgram?.slug ||
      masterProgram?.movementPattern ||
      MASTER_PROGRAM_ID_TO_SLUG[masterProgramId] ||
      masterProgramId;

    const EXCLUDED_FROM_AVG: Record<string, string[]> = { full_body: ['core'] };
    const MASTER_CAP: Record<string, number> = { full_body: 15 };

    // ── calisthenics_upper: restrict averaging to assessed skill tracks ──────
    //
    // Derived foundational tracks (push=L16, pull=L16) are written by the
    // SKILL_TO_FOUNDATION_OFFSET formula in onboarding-sync and can appear as
    // "configured" children, inflating the master level to L12 instead of L7.
    //
    // Three-tier resolution to determine which child IDs to include:
    //
    //   Tier 1 — progression.skillFocusIds (written by onboarding-sync for
    //             multi-skill users).  Most precise: exactly the skills the
    //             user assessed (e.g. ['planche', 'front_lever']).
    //
    //   Tier 2 — activePrograms[calisthenics_upper].focusDomains (also written
    //             by onboarding-sync; present even when skillFocusIds is absent
    //             on legacy user documents).
    //
    //   Tier 3 — Exclude any child whose programId is a known foundational
    //             domain slug.  This safety net catches push/pull/legs/core
    //             entries regardless of how they arrived in configuredChildIds,
    //             and is active whenever Tier 1 and Tier 2 are both absent.
    //
    // None of these tiers affect full_body / upper_body / lower_body averaging
    // — the guard only fires when masterSlug === 'calisthenics_upper'.

    // Foundational slugs that must NEVER contribute to a skill-master average.
    const SKILL_MASTER_FOUNDATIONAL_EXCLUDE = new Set([
      'push', 'pull', 'legs', 'core',
      'upper_body', 'lower_body', 'full_body',
    ]);

    let skillFocusIds: string[] | undefined;
    if (masterSlug === 'calisthenics_upper') {
      // Tier 1: direct skillFocusIds on progression
      const fromProgression = userData.progression?.skillFocusIds as string[] | undefined;
      if (fromProgression && fromProgression.length > 0) {
        // ── Defense A (supplement): normalize skillFocusIds through slug map ──
        // Legacy onboarding paths may have written Firestore hash IDs into
        // skillFocusIds (e.g. 'J0fLpmJhG0KDN2tQouxh') instead of slugs.
        // Normalise through the slug map so skillFocusIds.includes(childSlug)
        // comparisons work correctly regardless of the storage format.
        skillFocusIds = slugMap
          ? fromProgression.map(id => slugMap.idToSlug.get(id) ?? id)
          : fromProgression;
        console.log(`[Progression] calisthenics_upper averaging: Tier 1 skillFocusIds → [${skillFocusIds.join(', ')}]`);
      } else {
        // Tier 2: focusDomains on the calisthenics_upper activePrograms entry
        const calUpEntry = (userData.progression?.activePrograms ?? []).find(
          (ap: { templateId?: string; id?: string }) =>
            ap.templateId === 'calisthenics_upper' || ap.id === 'calisthenics_upper',
        );
        const fromFocusDomains = (calUpEntry as { focusDomains?: string[] } | undefined)
          ?.focusDomains;
        if (fromFocusDomains && fromFocusDomains.length > 0) {
          skillFocusIds = slugMap
            ? fromFocusDomains.map(id => slugMap.idToSlug.get(id) ?? id)
            : fromFocusDomains;
          console.log(`[Progression] calisthenics_upper averaging: Tier 2 focusDomains → [${skillFocusIds.join(', ')}]`);
        } else {
          console.log('[Progression] calisthenics_upper averaging: Tier 3 (foundational exclusion only — skillFocusIds absent)');
        }
      }
    }

    const excluded = EXCLUDED_FROM_AVG[masterSlug] ?? [];
    const avgChildren = subPrograms.filter(sp => {
      if (excluded.includes(sp.programId)) return false;
      if (!configuredChildIds.has(sp.programId)) return false;
      if (masterSlug === 'calisthenics_upper') {
        // Tier 1 / 2: explicit focus list → include ONLY these skill IDs.
        if (skillFocusIds && skillFocusIds.length > 0) {
          return skillFocusIds.includes(sp.programId);
        }
        // Tier 3 safety net: exclude all foundational domain slugs so the
        // average is computed from actual skill tracks only.
        return !SKILL_MASTER_FOUNDATIONAL_EXCLUDE.has(sp.programId);
      }
      return true;
    });

    // ── Defense C: Empty-set abort ────────────────────────────────────────
    // If the filter rejected every child BUT at least one child is genuinely
    // configured (level > 0), this is a routing/config mismatch — NOT a
    // legitimate "brand-new user with no assessed tracks" state.
    //
    // Returning routingEmptySkip=true tells recalculateMasterLevel to abort the
    // Firestore write entirely, preserving whatever level was already stored.
    //
    // The distinction:
    //   configuredChildIds.size === 0  → user has no assessed children → L0 write is correct
    //   configuredChildIds.size > 0    → children exist but all were filtered out → abort
    if (avgChildren.length === 0 && configuredChildIds.size > 0) {
      console.warn(
        `[Progression] getMasterProgramProgress: empty filter for master "${masterSlug}" ` +
        `(id: "${masterProgramId}") — ${configuredChildIds.size} configured ` +
        `${configuredChildIds.size === 1 ? 'child' : 'children'} ` +
        `[${[...configuredChildIds].join(', ')}] were ALL rejected by the averaging filter. ` +
        `skillFocusIds: [${skillFocusIds?.join(', ') ?? 'none'}]. ` +
        `Aborting recalculation to prevent level wipeout (routingEmptySkip=true).`,
      );
      return {
        displayLevel: 0,
        displayPercent: 0,
        subPrograms,
        priorMasterLevel,
        routingEmptySkip: true,
      };
    }

    // avgCount falls back to 1 to avoid division-by-zero when no children are
    // configured yet (brand-new user who hasn't completed any assessment for
    // this master's domain).  In that case avgLevel = 0, displayLevel = 0.
    const avgCount = avgChildren.length || 1;
    const avgLevel = avgChildren.reduce((sum, sp) => sum + sp.level, 0) / avgCount;
    const avgPercent = avgChildren.reduce((sum, sp) => sum + sp.percent, 0) / avgCount;
    const cap = MASTER_CAP[masterSlug] ?? Infinity;
    const displayLevel = Math.min(cap, Math.round(avgLevel));
    const displayPercent = avgPercent;

    return {
      displayLevel,
      displayPercent: Math.round(displayPercent * 100) / 100,
      subPrograms,
      priorMasterLevel,
    };
  } catch (error) {
    console.error('Error getting master program progress:', error);
    return null;
  }
}

/**
 * Recalculate and persist a master program's level based on current child tracks.
 * This is called after any child track is updated (XP award, workout completion, etc.)
 * to keep the master-level view in sync.
 *
 * The result is written to `progression.tracks[masterProgramId]`.
 *
 * Safety guarantees (three-defense model):
 *   A. Slug routing  — getMasterProgramProgress uses buildProgramSlugMap() so
 *      Firestore hash IDs are reliably resolved to canonical slug keys.
 *   B. Monotonic floor — the persisted level is always Math.max(computed, prior),
 *      so a master track can only climb or hold; it can never drop on a save hook.
 *   C. Empty-set abort — if getMasterProgramProgress detected that all configured
 *      children were rejected by the averaging filter (routingEmptySkip=true),
 *      this function skips the Firestore write entirely and returns null.
 */
export async function recalculateMasterLevel(
  userId: string,
  masterProgramId: string,
): Promise<{ level: number; percent: number } | null> {
  const progress = await getMasterProgramProgress(userId, masterProgramId);
  if (!progress) return null;

  const masterSlug = MASTER_PROGRAM_ID_TO_SLUG[masterProgramId] ?? masterProgramId;

  // ── Defense C: Empty-set abort ────────────────────────────────────────────
  // getMasterProgramProgress sets routingEmptySkip when configured children
  // exist but were all rejected by the filter — a routing/config gap, not a
  // legitimate L0 user.  Persisting displayLevel=0 in this state would wipe
  // the user's earned master progression, so we abort unconditionally.
  if (progress.routingEmptySkip) {
    console.warn(
      `[Progression] recalculateMasterLevel: ABORTED write for master "${masterProgramId}" ` +
      `(slug: "${masterSlug}") — routingEmptySkip flag set by getMasterProgramProgress. ` +
      `Existing level ${progress.priorMasterLevel ?? 0} preserved. ` +
      `Check slug map coverage for skill program hashes in subPrograms[].`,
    );
    return null;
  }

  // ── Defense B: Monotonic safety floor ────────────────────────────────────
  // A master track may NEVER drop below its previously-persisted level.
  // priorMasterLevel is extracted from the same user-doc read inside
  // getMasterProgramProgress — no additional Firestore round-trip required.
  //
  // safeLevel = max(computed average, previously stored master level)
  // This means:
  //   • Legitimate progression: safeLevel = computed (computed ≥ prior)
  //   • Transient child-routing glitch producing a lower average: safeLevel = prior (floor kicks in)
  //   • Brand-new user (prior = 0): safeLevel = computed (no-op floor)
  const priorLevel = progress.priorMasterLevel ?? 0;
  const safeLevel = Math.max(progress.displayLevel, priorLevel);
  // Master percent is a derived average across children — always use the current
  // computed value. The monotonic guarantee is on the level, not the percent.
  const safePercent = progress.displayPercent;

  // Persist the aggregated level into the master program's own track.
  // Dual-write: once under the Firestore hash key (e.g. 'H2279XsRGDg9G370J7S9')
  // and once under the canonical slug key (e.g. 'full_body') so every reader
  // (admin panel, workout engine, dashboard) finds the correct value regardless
  // of which key format it uses.
  const firestoreWrites: Record<string, unknown> = {
    [`progression.tracks.${masterProgramId}.currentLevel`]: safeLevel,
    [`progression.tracks.${masterProgramId}.percent`]:      safePercent,
    [`progression.domains.${masterProgramId}.currentLevel`]: safeLevel,
    updatedAt: serverTimestamp(),
  };
  if (masterSlug !== masterProgramId) {
    firestoreWrites[`progression.tracks.${masterSlug}.currentLevel`] = safeLevel;
    firestoreWrites[`progression.tracks.${masterSlug}.percent`]      = safePercent;
    firestoreWrites[`progression.domains.${masterSlug}.currentLevel`] = safeLevel;
  }

  const userDocRef = doc(db, USERS_COLLECTION, userId);
  await updateDoc(userDocRef, firestoreWrites);

  const floorApplied = safeLevel > progress.displayLevel;
  console.log(
    `[Progression] Master "${masterProgramId}" (slug: "${masterSlug}") recalculated → ` +
    `Level ${safeLevel}, ${safePercent.toFixed(2)}%` +
    ` (from ${progress.subPrograms.length} children` +
    (floorApplied ? `, monotonic floor: computed=${progress.displayLevel} < prior=${priorLevel} → clamped to ${safeLevel}` : '') +
    `)`,
  );

  return { level: safeLevel, percent: safePercent };
}

/**
 * Given a child programId, find all ancestor master programs that reference it
 * (directly or transitively) and recalculate their levels.
 */
export async function recalculateAncestorMasters(
  userId: string,
  childProgramId: string,
): Promise<void> {
  // Virtual aliases (e.g. 'lower_body') are not real Firestore program documents.
  // Expand them to their leaf children and recurse, then return early.
  // This prevents noisy "no match for lower_body" warnings on every workout completion.
  const virtualChildren = KNOWN_MASTER_PROGRAMS[childProgramId];
  if (virtualChildren) {
    for (const leafId of virtualChildren) {
      await recalculateAncestorMasters(userId, leafId);
    }
    return;
  }

  try {
    // Fetch all programs that list this child in subPrograms
    const q = query(
      collection(db, PROGRAMS_COLLECTION),
      where('isMaster', '==', true),
    );
    const snapshot = await getDocs(q);
    const masterPrograms = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Program));

    // subPrograms in Firestore stores Firestore hash IDs (e.g. 'J0fLpmJhG0KDN2tQouxh').
    // childProgramId arrives here as a slug (e.g. 'push') from processBottomUpMasterCompletion.
    // Resolve the slug to its Firestore hash so .includes() matches correctly.
    //
    // MASTER_PROGRAM_SLUG_TO_ID only covers master programs — leaf domain programs
    // (push, pull, legs, core) are absent from that map. For those we look up the
    // program document via getProgramByTemplateId to get the real Firestore doc ID.
    let childHash = MASTER_PROGRAM_SLUG_TO_ID[childProgramId] ?? childProgramId;
    if (childHash === childProgramId) {
      // childProgramId is a slug that isn't a known master slug → leaf domain.
      // Fetch the program document to get its Firestore hash ID.
      try {
        const childDoc = await getProgramByTemplateId(childProgramId);
        if (childDoc?.id) childHash = childDoc.id;
      } catch {
        // Non-blocking — fall through with slug, the extra includes() check below
        // will still catch cases where subPrograms was written with slugs.
      }
    }

    for (const master of masterPrograms) {
      if (
        master.subPrograms?.includes(childHash) ||
        master.subPrograms?.includes(childProgramId)
      ) {
        await recalculateMasterLevel(userId, master.id);
        // Recurse upward in case this master is itself a child of a grand-master
        await recalculateAncestorMasters(userId, master.id);
      }
    }
  } catch (error) {
    console.error('Error recalculating ancestor masters:', error);
  }
}

// ============================================================================
// LEVEL EQUIVALENCE: Auto-map levels between programs
// ============================================================================

/**
 * Fetch all level equivalence rules that match a given source program and level.
 * Called after a child program levels up to check if any target programs should be unlocked/set.
 *
 * @param sourceProgramId - The program that just leveled up. Returns every enabled
 *   rule that references it in ANY of its conditions — threshold evaluation
 *   (including AND/OR across the rule's other conditions) happens in the caller,
 *   which has the full current tracks map.
 * @returns Candidate equivalence rules (not yet evaluated against thresholds)
 */
async function getLevelEquivalenceRules(
  sourceProgramId: string,
): Promise<LevelEquivalenceRule[]> {
  try {
    const q = query(
      collection(db, LEVEL_EQUIVALENCE_COLLECTION),
      where('sourceProgramIds', 'array-contains', sourceProgramId),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as LevelEquivalenceRule))
      .filter(rule => rule.isEnabled !== false); // Enabled by default
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.includes('index') || msg.includes('requires an index')) {
      console.warn(
        '[LevelEquivalence] Missing Firestore composite index — create it via the link in the error below. ' +
        'The app will continue without level equivalences until the index is built.',
      );
    }
    console.error('[LevelEquivalence] Error fetching rules:', error);
    return [];
  }
}

/**
 * Evaluate whether a rule's conditions are satisfied against the user's current
 * levels. The domain that just leveled up (`changedProgramId`) uses the freshly
 * computed `changedLevel` (avoids any read-after-write race with `tracks`,
 * which was read from Firestore moments earlier in the same call); every other
 * condition's domain reads its current level straight from `tracks`.
 */
function evaluateRuleConditions(
  rule: LevelEquivalenceRule,
  changedProgramId: string,
  changedLevel: number,
  tracks: Record<string, { currentLevel?: number } | undefined>,
): { satisfied: boolean; snapshot: Record<string, number> } {
  const snapshot: Record<string, number> = {};
  const levelFor = (programId: string): number => {
    const level = programId === changedProgramId
      ? changedLevel
      : (tracks[programId]?.currentLevel ?? 0);
    snapshot[programId] = level;
    return level;
  };

  const checks = rule.conditions.map(c => levelFor(c.programId) >= c.minLevel);
  const satisfied = rule.logic === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
  return { satisfied, snapshot };
}

/**
 * Apply level equivalence rules after a program levels up. Rules are grouped by
 * `mode`:
 *   - 'auto'    — if the target track doesn't exist or is below the rule's
 *                 targetLevel, set it directly; optionally add to activePrograms;
 *                 recalculate ancestor masters for the target. Unchanged legacy
 *                 behavior, kept for cases that should stay silent/automatic.
 *   - 'suggest' — write a pending suggestion (progression.pendingProgramSuggestions,
 *                 deduped by ruleId) instead. No track/activePrograms mutation,
 *                 no ancestor recalculation — nothing changed until the user
 *                 accepts (acceptance flow is separate, not built here).
 *
 * A rule's full condition set (which may reference domains other than the one
 * that just leveled up) is evaluated against the user's current tracks — this
 * is what makes AND ("push AND pull both reached X") and OR ("push OR planche
 * reached X") work, not just the single domain that triggered this call.
 *
 * @param userId - User ID
 * @param sourceProgramId - The program that just leveled up (used to find
 *   candidate rules via array-contains on sourceProgramIds, and as the fresh
 *   value for that one domain during evaluation)
 * @param newSourceLevel - The new level reached in sourceProgramId
 * @returns Array of applied/suggested equivalence results
 */
export async function applyLevelEquivalences(
  userId: string,
  sourceProgramId: string,
  newSourceLevel: number,
): Promise<LevelEquivalenceResult[]> {
  const results: LevelEquivalenceResult[] = [];

  try {
    const candidateRules = await getLevelEquivalenceRules(sourceProgramId);
    if (candidateRules.length === 0) return results;

    // Fetch user document once
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) return results;

    const userData = userSnap.data() as UserFullProfile;
    const tracks = userData.progression?.tracks || {};
    const activePrograms = userData.progression?.activePrograms || [];
    const existingSuggestions = userData.progression?.pendingProgramSuggestions ?? [];

    const updates: Record<string, any> = {};
    let activeUpdated = false;
    const updatedActivePrograms = [...activePrograms];

    let suggestionsUpdated = false;
    const updatedSuggestions = [...existingSuggestions];
    const suggestedRuleIds = new Set(existingSuggestions.map(s => s.ruleId));

    // Rules recalculateAncestorMasters must run for — 'auto' targets only.
    const autoTargetsToRecalculate: string[] = [];

    for (const rule of candidateRules) {
      const { satisfied, snapshot } = evaluateRuleConditions(
        rule, sourceProgramId, newSourceLevel, tracks,
      );
      if (!satisfied) continue;

      const currentTrack = tracks[rule.targetProgramId];
      const currentLevel = currentTrack?.currentLevel ?? 0;
      const wasNewlyUnlocked = !currentTrack;

      // Only apply/suggest if the target's current level is BELOW the rule's target
      if (currentLevel >= rule.targetLevel) continue;

      const mode = rule.mode ?? 'auto'; // defensive default for any hand-edited doc missing mode

      if (mode === 'suggest') {
        if (suggestedRuleIds.has(rule.id)) continue; // already suggested — don't duplicate
        if (!(await isValidProgramTemplateId(rule.targetProgramId))) {
          console.warn(
            '🚨 [LevelEquivalence] Rejecting suggestion — rule ' +
            `${rule.id} has an unresolvable targetProgramId:`,
            JSON.stringify(rule.targetProgramId),
          );
          continue;
        }
        updatedSuggestions.push({
          ruleId: rule.id,
          targetProgramId: rule.targetProgramId,
          targetLevel: rule.targetLevel,
          targetPercent: rule.targetPercent,
          triggeredAt: new Date().toISOString(),
          conditionsSnapshot: snapshot,
        });
        suggestedRuleIds.add(rule.id);
        suggestionsUpdated = true;

        results.push({
          ruleId: rule.id,
          targetProgramId: rule.targetProgramId,
          previousLevel: currentLevel,
          newLevel: rule.targetLevel,
          wasNewlyUnlocked,
          mode: 'suggest',
        });
        console.log(
          `[LevelEquivalence] Suggested (not applied): ${rule.logic} [${rule.conditions.map(c => `${c.programId}≥${c.minLevel}`).join(', ')}] → ` +
          `${rule.targetProgramId} Lvl ${rule.targetLevel} (snapshot: ${JSON.stringify(snapshot)})`,
        );
        continue;
      }

      // ── mode === 'auto' — legacy direct-write behavior ──────────────────
      updates[`progression.tracks.${rule.targetProgramId}.currentLevel`] = rule.targetLevel;
      updates[`progression.tracks.${rule.targetProgramId}.percent`] = rule.targetPercent ?? 0;

      // Add to activePrograms if requested and not already present.
      // Validate the rule's `targetProgramId` resolves to a real
      // Program first — equivalence rules are admin-edited Firestore
      // docs and a single typo in the admin form (or a stale id
      // pointing at a deleted program) would otherwise propagate the
      // corrupt slug into every user's activePrograms next time they
      // level up. Mirrors the safety net in onboarding-sync.
      if (rule.addToActivePrograms) {
        const alreadyActive = updatedActivePrograms.some(
          (p: any) => p.id === rule.targetProgramId || p.templateId === rule.targetProgramId,
        );
        if (!alreadyActive) {
          if (!(await isValidProgramTemplateId(rule.targetProgramId))) {
            console.warn(
              '🚨 [LevelEquivalence] Rejecting activePrograms push — rule ' +
              `${rule.id} has an unresolvable targetProgramId:`,
              JSON.stringify(rule.targetProgramId),
            );
          } else {
            updatedActivePrograms.push({
              id: rule.targetProgramId,
              templateId: rule.targetProgramId,
              name: rule.targetProgramId.replace(/_/g, ' '),
              startDate: new Date().toISOString(),
              durationWeeks: 52,
              currentWeek: 1,
              focusDomains: [rule.targetProgramId] as any,
            });
            activeUpdated = true;
          }
        }
      }

      autoTargetsToRecalculate.push(rule.targetProgramId);
      results.push({
        ruleId: rule.id,
        targetProgramId: rule.targetProgramId,
        previousLevel: currentLevel,
        newLevel: rule.targetLevel,
        wasNewlyUnlocked,
        mode: 'auto',
      });

      console.log(
        `[LevelEquivalence] ${rule.logic} [${rule.conditions.map(c => `${c.programId}≥${c.minLevel}`).join(', ')}] → ` +
        `${rule.targetProgramId} set to Lvl ${rule.targetLevel}` +
        (wasNewlyUnlocked ? ' (newly unlocked)' : ` (was Lvl ${currentLevel})`),
      );
    }

    // Write all updates in one batch
    if (Object.keys(updates).length > 0 || suggestionsUpdated) {
      updates['updatedAt'] = serverTimestamp();
      if (activeUpdated) {
        updates['progression.activePrograms'] = updatedActivePrograms;
      }
      if (suggestionsUpdated) {
        updates['progression.pendingProgramSuggestions'] = updatedSuggestions;
      }
      await updateDoc(userDocRef, updates);

      // Recalculate master programs for each auto-applied target only —
      // suggest-mode targets never had a track write, nothing to recalculate.
      for (const targetProgramId of autoTargetsToRecalculate) {
        await recalculateAncestorMasters(userId, targetProgramId);
      }
    }
  } catch (error) {
    console.error('[LevelEquivalence] Error applying rules:', error);
  }

  return results;
}

/**
 * Initialize progression tracks for a user with default values
 * 
 * @param userId - User ID
 * @param domains - Array of domain IDs to initialize
 * @returns Promise<boolean> - Success status
 */
export async function initializeProgressionTracks(
  userId: string,
  domains: string[]
): Promise<boolean> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error('User not found:', userId);
      return false;
    }

    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;

    // Ensure tracks are initialized
    ensureTracksInitialized(progression);

    // Initialize missing domains
    const updatedTracks = { ...progression.tracks };
    let hasChanges = false;

    for (const domain of domains) {
      if (!updatedTracks[domain]) {
        updatedTracks[domain] = getDefaultTrackProgress();
        hasChanges = true;
      }
    }

    // Update Firestore if there were changes
    if (hasChanges) {
      await updateProgressionTracks(userId, updatedTracks);
    }

    return true;
  } catch (error) {
    console.error('Error initializing progression tracks:', error);
    return false;
  }
}

// ============================================================================
// NEW: WORKOUT COMPLETION PROCESSING WITH LINKED PROGRAMS
// ============================================================================

/**
 * Progression rule result with all settings including volume-based fields
 */
interface ProgressionRuleResult {
  baseSessionGain: number;
  bonusPercent: number;
  requiredSetsForFullGain: number;
  linkedPrograms: LinkedProgramConfig[];
}

/**
 * Get progression rule for a specific program and level
 * Falls back to defaults if no rule is defined
 */
async function getProgressionRuleForLevel(
  programId: string,
  level: number
): Promise<ProgressionRuleResult> {
  const levelDefaults = DEFAULT_PROGRESSION_BY_LEVEL[Math.min(level, 10)] || DEFAULT_PROGRESSION_BY_LEVEL[10];

  try {
    const ruleId = `${programId}_level_${level}`;
    const ruleDoc = await getDoc(doc(db, PROGRESSION_RULES_COLLECTION, ruleId));
    
    if (ruleDoc.exists()) {
      const data = ruleDoc.data();
      const resolved = {
        baseSessionGain: data.baseGain ?? data.baseSessionGain ?? levelDefaults.baseGain,
        bonusPercent: data.bonusPercent ?? levelDefaults.bonusPercent,
        requiredSetsForFullGain: data.requiredSetsForFullGain ?? data.requiredSets ?? getDefaultRequiredSets(level),
        linkedPrograms: data.linkedPrograms ?? [],
      };
      console.log(`[Progression] Rule loaded: ${ruleId}`, resolved, '(raw Firestore:', data, ')');
      return resolved;
    }

    // No doc in progression_rules — check programLevelSettings as secondary source
    try {
      const plsDoc = await getDoc(doc(db, 'programLevelSettings', ruleId));
      if (plsDoc.exists()) {
        const pls = plsDoc.data();
        if (pls.baseSessionGain != null || pls.baseGain != null) {
          const resolved = {
            baseSessionGain: pls.baseGain ?? pls.baseSessionGain ?? levelDefaults.baseGain,
            bonusPercent: pls.bonusPercent ?? levelDefaults.bonusPercent,
            requiredSetsForFullGain: pls.requiredSetsForFullGain ?? pls.requiredSets ?? getDefaultRequiredSets(level),
            linkedPrograms: pls.linkedPrograms ?? [],
          };
          console.log(`[Progression] Rule from programLevelSettings: ${ruleId}`, resolved);
          return resolved;
        }
      }
    } catch { /* secondary lookup — non-critical */ }

    console.log(`[Progression] No rule for ${ruleId} — using defaults:`, levelDefaults);
    return {
      baseSessionGain: levelDefaults.baseGain,
      bonusPercent: levelDefaults.bonusPercent,
      requiredSetsForFullGain: getDefaultRequiredSets(level),
      linkedPrograms: [],
    };
  } catch (error) {
    console.error('Error fetching progression rule:', error);
    return {
      baseSessionGain: levelDefaults.baseGain,
      bonusPercent: levelDefaults.bonusPercent,
      requiredSetsForFullGain: getDefaultRequiredSets(level),
      linkedPrograms: [],
    };
  }
}

/**
 * Detect linked programs from exercise programLevels
 * Returns programs that exist in the exercise's programLevels
 */
function detectLinkedProgramsFromExercises(
  exercises: WorkoutExerciseResult[],
  activeProgramId: string
): Set<string> {
  const linkedPrograms = new Set<string>();
  
  for (const exercise of exercises) {
    if (exercise.programLevels) {
      for (const programId of Object.keys(exercise.programLevels)) {
        if (programId !== activeProgramId && exercise.programLevels[programId] !== undefined) {
          linkedPrograms.add(programId);
        }
      }
    }
  }
  
  return linkedPrograms;
}

/**
 * Calculate total sets performed across all exercises
 */
function calculateTotalSetsPerformed(exercises: WorkoutExerciseResult[]): number {
  return exercises.reduce((sum, exercise) => sum + exercise.setsCompleted, 0);
}

/**
 * Calculate volume breakdown for Dopamine Screen display.
 * Pay-as-you-go: Gain is strictly linear — (Completed Sets / Target Sets) * Total Possible Gain.
 * minSets is ignored; even 1 set earns proportional credit (e.g., 1/10 = 10% of session progress).
 */
function calculateVolumeBreakdown(
  setsPerformed: number,
  requiredSets: number
): VolumeBreakdown {
  const volumeRatio = Math.min(1, setsPerformed / requiredSets);
  return {
    setsPerformed,
    requiredSets,
    volumeRatio,
    isFullVolume: volumeRatio >= 1,
  };
}

/**
 * Calculate performance ratio (actual vs target)
 */
function calculatePerformanceRatio(exercises: WorkoutExerciseResult[]): number {
  let totalActual = 0;
  let totalTarget = 0;
  
  for (const exercise of exercises) {
    const actualReps = exercise.repsPerSet.reduce((sum, r) => sum + r, 0);
    const targetReps = exercise.targetReps * exercise.setsCompleted;
    
    totalActual += actualReps;
    totalTarget += targetReps;
  }
  
  if (totalTarget === 0) return 1;
  return totalActual / totalTarget;
}

/**
 * Calculate volume contribution per linked program
 * Based on how many exercises from each program were performed
 */
function calculateVolumeContribution(
  exercises: WorkoutExerciseResult[],
  linkedProgramId: string
): number {
  let linkedExerciseCount = 0;
  let totalExerciseCount = exercises.length;
  
  for (const exercise of exercises) {
    if (exercise.programLevels && exercise.programLevels[linkedProgramId] !== undefined) {
      linkedExerciseCount++;
    }
  }
  
  if (totalExerciseCount === 0) return 0;
  return linkedExerciseCount / totalExerciseCount;
}

/**
 * Check if user is ready for split training
 */
function checkReadyForSplit(
  tracks: { [programId: string]: DomainTrackProgress },
  activeProgramId: string,
  newLevel: number
): ReadyForSplitStatus | undefined {
  if (!READY_FOR_SPLIT_PROGRAMS.includes(activeProgramId)) {
    return undefined;
  }
  
  if (newLevel >= READY_FOR_SPLIT_LEVEL) {
    return {
      isReady: true,
      triggeredAt: new Date(),
      suggestedSplit: ['upper_body', 'lower_body', 'push', 'pull', 'legs'],
    };
  }
  
  return undefined;
}

// ============================================================================
// PROGRAM EVOLUTION ENGINE
// ============================================================================

const EVOLUTION_UPPER_LOWER_LEVEL = 13;
const EVOLUTION_PPL_LEVEL = 18;

interface PendingEvolution {
  targetSplit: 'upper_lower' | 'push_pull_legs';
  triggeredAt: string;
  sourceProgram: string;
  sourceLevelAtTrigger: number;
  subLevelsSnapshot: Record<string, number>;
}

/**
 * Evaluate whether a program evolution should be triggered.
 *
 * - full_body reaching L13 → pendingProgramEvolution: 'upper_lower'
 * - upper_body reaching L18 → pendingProgramEvolution: 'push_pull_legs'
 *
 * Returns undefined if no evolution is warranted.
 */
function evaluateProgramEvolution(
  tracks: { [programId: string]: DomainTrackProgress },
  activeProgramId: string,
  newLevel: number,
): PendingEvolution | undefined {
  const subLevels: Record<string, number> = {};
  for (const childId of ['push', 'pull', 'legs', 'core']) {
    subLevels[childId] = tracks[childId]?.currentLevel ?? 0;
  }

  if (activeProgramId === 'full_body' && newLevel >= EVOLUTION_UPPER_LOWER_LEVEL) {
    return {
      targetSplit: 'upper_lower',
      triggeredAt: new Date().toISOString(),
      sourceProgram: activeProgramId,
      sourceLevelAtTrigger: newLevel,
      subLevelsSnapshot: subLevels,
    };
  }

  if (activeProgramId === 'upper_body' && newLevel >= EVOLUTION_PPL_LEVEL) {
    return {
      targetSplit: 'push_pull_legs',
      triggeredAt: new Date().toISOString(),
      sourceProgram: activeProgramId,
      sourceLevelAtTrigger: newLevel,
      subLevelsSnapshot: subLevels,
    };
  }

  return undefined;
}

/**
 * Execute the program evolution: transfer sub-levels from the source program
 * into new program entries. Called when the user accepts the evolution prompt.
 *
 * Level Transfer Rules:
 *   full_body → upper_body + lower_body
 *     upper_body inherits max(push, pull) levels
 *     lower_body inherits max(legs, core) levels
 *     Sub-tracks (push, pull, legs, core) carry over unchanged
 *
 *   upper_body → push + pull + legs
 *     Each inherits its own sub-level from tracks
 *     core stays as-is
 */
export function buildEvolvedPrograms(
  evolution: PendingEvolution,
): {
  newActivePrograms: Array<{
    id: string;
    templateId: string;
    name: string;
    startDate: string;
    durationWeeks: number;
    currentWeek: number;
    focusDomains: string[];
  }>;
  newTracks: Record<string, { currentLevel: number; percent: number }>;
} {
  const snap = evolution.subLevelsSnapshot;
  const now = new Date().toISOString();

  if (evolution.targetSplit === 'upper_lower') {
    const upperLevel = Math.max(snap.push ?? 1, snap.pull ?? 1);
    const lowerLevel = Math.max(snap.legs ?? 1, snap.core ?? 1);

    return {
      newActivePrograms: [
        {
          id: 'upper_body',
          templateId: 'upper_body',
          name: 'Upper Body',
          startDate: now,
          durationWeeks: 52,
          currentWeek: 1,
          focusDomains: ['push', 'pull'],
        },
        {
          id: 'lower_body',
          templateId: 'lower_body',
          name: 'Lower Body',
          startDate: now,
          durationWeeks: 52,
          currentWeek: 1,
          focusDomains: ['legs', 'core'],
        },
      ],
      newTracks: {
        upper_body: { currentLevel: upperLevel, percent: 0 },
        lower_body: { currentLevel: lowerLevel, percent: 0 },
        push: { currentLevel: snap.push ?? 1, percent: 0 },
        pull: { currentLevel: snap.pull ?? 1, percent: 0 },
        legs: { currentLevel: snap.legs ?? 1, percent: 0 },
        core: { currentLevel: snap.core ?? 1, percent: 0 },
      },
    };
  }

  // push_pull_legs split
  return {
    newActivePrograms: [
      {
        id: 'push',
        templateId: 'push',
        name: 'Push',
        startDate: now,
        durationWeeks: 52,
        currentWeek: 1,
        focusDomains: ['push'],
      },
      {
        id: 'pull',
        templateId: 'pull',
        name: 'Pull',
        startDate: now,
        durationWeeks: 52,
        currentWeek: 1,
        focusDomains: ['pull'],
      },
      {
        id: 'legs',
        templateId: 'legs',
        name: 'Legs',
        startDate: now,
        durationWeeks: 52,
        currentWeek: 1,
        focusDomains: ['legs', 'core'],
      },
    ],
    newTracks: {
      push: { currentLevel: snap.push ?? 1, percent: 0 },
      pull: { currentLevel: snap.pull ?? 1, percent: 0 },
      legs: { currentLevel: snap.legs ?? 1, percent: 0 },
      core: { currentLevel: snap.core ?? 1, percent: 0 },
    },
  };
}

// ============================================================================
// BOTTOM-UP HELPERS: Keyword Classifier + Muscle Group Builder
// ============================================================================

const CHILD_LABELS: Record<string, string> = {
  push: 'דחיפה',
  pull: 'משיכה',
  legs: 'רגליים',
  core: 'ליבה',
  upper_body: 'פלג עליון',
  lower_body: 'פלג תחתון',
};

/**
 * Batch-fetch exercise documents from Firestore for all unique IDs in the log.
 * Returns a map of exerciseId → Exercise for O(1) lookups during classification.
 */
async function fetchExerciseLookup(
  exercises: WorkoutExerciseResult[],
): Promise<Map<string, Exercise>> {
  const uniqueIds = [...new Set(exercises.map(e => e.exerciseId).filter(Boolean))];
  const results = await Promise.all(
    uniqueIds.map(id => getExercise(id).catch(() => null)),
  );
  const map = new Map<string, Exercise>();
  for (let i = 0; i < uniqueIds.length; i++) {
    if (results[i]) map.set(uniqueIds[i], results[i]!);
  }
  return map;
}

/**
 * Result of exercise classification — carries diagnostic info for logging.
 */
interface ClassificationResult {
  childSlug: string | null;
  tier: 'targetPrograms' | 'programIds' | 'programLevels' | 'keyword' | null;
  resolvedFrom?: string;
}

/**
 * Classify an exercise to a child program slug.
 *
 * The critical step: exercise programIds / targetPrograms contain raw Firestore
 * IDs (e.g. "H2279XsRGDg9G370J7S9"). We resolve each ID to its slug via the
 * programSlugMap, then compare against the child slug list.
 *
 * Master programs (full_body, upper_body, etc.) are skipped during resolution
 * so an exercise linked to both "full_body" and "legs" correctly maps to "legs".
 *
 * Priority order:
 *   1. targetPrograms resolved through slug map
 *   2. programIds resolved through slug map
 *   3. programLevels from the log entry (legacy)
 *   4. Keyword matching on exercise name (last resort)
 */
function classifyExerciseToChild(
  exerciseName: string,
  programLevels: Record<string, number> | undefined,
  childSlugs: string[],
  firestoreExercise: Exercise | null | undefined,
  slugMap: ProgramSlugMap | null,
): ClassificationResult {
  const masterSlugs = new Set(Object.keys(KNOWN_MASTER_PROGRAMS));

  // ── Tier 1: targetPrograms → resolve IDs to slugs ─────────────────────
  if (firestoreExercise?.targetPrograms?.length && slugMap) {
    for (const tp of firestoreExercise.targetPrograms) {
      const slug = slugMap.idToSlug.get(tp.programId);
      if (slug && masterSlugs.has(slug)) continue;
      if (slug && childSlugs.includes(slug)) {
        return { childSlug: slug, tier: 'targetPrograms', resolvedFrom: tp.programId };
      }
    }
  }

  // ── Tier 2: programIds → resolve IDs to slugs ─────────────────────────
  if (firestoreExercise?.programIds?.length && slugMap) {
    for (const pid of firestoreExercise.programIds) {
      const slug = slugMap.idToSlug.get(pid);
      if (slug && masterSlugs.has(slug)) continue;
      if (slug && childSlugs.includes(slug)) {
        return { childSlug: slug, tier: 'programIds', resolvedFrom: pid };
      }
    }
  }

  // ── Tier 3: programLevels from the log entry ──────────────────────────
  if (programLevels) {
    for (const childSlug of childSlugs) {
      if (programLevels[childSlug] !== undefined) {
        return { childSlug, tier: 'programLevels' };
      }
    }
  }

  // ── Tier 4: keyword matching (last resort) ────────────────────────────
  const name = exerciseName.toLowerCase();

  if (name.includes('pull') || name.includes('row') || name.includes('chin') || name.includes('curl') || name.includes('משיכ') || name.includes('מתח')) {
    const match = childSlugs.find(id => id.includes('pull'));
    if (match) return { childSlug: match, tier: 'keyword' };
  }
  if (name.includes('squat') || name.includes('lunge') || name.includes('leg') || name.includes('calf') || name.includes('רגל') || name.includes('סקוואט') || name.includes('ירך')) {
    const match = childSlugs.find(id => id.includes('leg'));
    if (match) return { childSlug: match, tier: 'keyword' };
  }
  if (name.includes('plank') || name.includes('core') || name.includes('abs') || name.includes('ליבה') || name.includes('בטן')) {
    const match = childSlugs.find(id => id.includes('core'));
    if (match) return { childSlug: match, tier: 'keyword' };
  }
  if (name.includes('push') || name.includes('press') || name.includes('dip') || name.includes('fly') || name.includes('דחיפ') || name.includes('שכיב') || name.includes('לחיצ')) {
    const match = childSlugs.find(id => id.includes('push'));
    if (match) return { childSlug: match, tier: 'keyword' };
  }

  return { childSlug: null, tier: null };
}

/**
 * Build muscle group progress breakdown from exercises.
 */
function buildMuscleGroupProgress(
  exercises: WorkoutExerciseResult[],
): import('../../core/types/progression.types').MuscleGroupProgress[] {
  const map: Record<string, { group: 'push' | 'pull' | 'legs' | 'core'; label: string; sets: number; reps: number; count: number }> = {
    push: { group: 'push', label: 'דחיפה', sets: 0, reps: 0, count: 0 },
    pull: { group: 'pull', label: 'משיכה', sets: 0, reps: 0, count: 0 },
    legs: { group: 'legs', label: 'רגליים', sets: 0, reps: 0, count: 0 },
    core: { group: 'core', label: 'ליבה', sets: 0, reps: 0, count: 0 },
  };
  for (const ex of exercises) {
    const name = ex.exerciseName.toLowerCase();
    let group = 'push';
    if (name.includes('pull') || name.includes('row') || name.includes('chin') || name.includes('משיכ')) group = 'pull';
    else if (name.includes('squat') || name.includes('lunge') || name.includes('leg') || name.includes('רגל') || name.includes('סקוואט')) group = 'legs';
    else if (name.includes('plank') || name.includes('core') || name.includes('abs') || name.includes('ליבה') || name.includes('בטן')) group = 'core';
    else if (name.includes('push') || name.includes('press') || name.includes('dip') || name.includes('דחיפ') || name.includes('שכיבות')) group = 'push';
    const entry = map[group];
    if (entry) {
      entry.sets += ex.setsCompleted;
      entry.reps += ex.repsPerSet.reduce((s, r) => s + r, 0);
      entry.count++;
    }
  }
  return Object.values(map).filter(e => e.count > 0).map(e => ({
    group: e.group,
    label: e.label,
    setsCompleted: e.sets,
    totalReps: e.reps,
    exerciseCount: e.count,
  }));
}

// ============================================================================
// BOTTOM-UP MASTER COMPLETION
// ============================================================================

/**
 * Process workout completion for a MASTER program (e.g., full_body)
 * using bottom-up child aggregation.
 *
 * Instead of looking for a non-existent master rule, this:
 * 1. Classifies each exercise to a child program (push/pull/legs/core)
 * 2. Fetches each child's progression rule from Firestore
 * 3. Calculates gain per child using the child's own thresholds
 * 4. Aggregates to a master gain (average across ALL children)
 * 5. Updates child tracks, then recalculates the master track
 */
async function processBottomUpMasterCompletion(
  data: WorkoutCompletionData,
  userData: UserFullProfile,
  masterProgram: Program,
  progression: NonNullable<UserFullProfile['progression']>,
): Promise<WorkoutCompletionResult> {
  const { userId, activeProgramId, exercises, completedAt } = data;
  const childProgramIds = masterProgram.subPrograms!;
  const updatedTracks = { ...progression.tracks };

  // ── 1. Build Program Slug Map (resolves Firestore IDs → slugs like 'push', 'legs')
  let slugMap: ProgramSlugMap | null = null;
  try {
    slugMap = await buildProgramSlugMap();
    console.log(`[Progression] Bottom-Up: Built slug map with ${slugMap.idToSlug.size} programs`);
  } catch (e) {
    console.warn('[Progression] Bottom-Up: Slug map build failed:', e);
  }

  // Normalize childProgramIds to slugs. If they are already slugs (from Tier 3
  // hardcoded fallback), they pass through unchanged. If they are Firestore IDs
  // (from a real master program's subPrograms), they get resolved.
  const childSlugs = childProgramIds.map(id => slugMap?.idToSlug.get(id) ?? id);

  console.log(`[Progression] Bottom-Up: Master "${activeProgramId}" → child slugs [${childSlugs.join(', ')}]`);

  // ── 2. Fetch exercise documents from Firestore for DB-driven classification
  let exerciseLookup = new Map<string, Exercise>();
  try {
    exerciseLookup = await fetchExerciseLookup(exercises);
    console.log(`[Progression] Bottom-Up: Fetched ${exerciseLookup.size}/${exercises.length} exercise docs from Firestore`);
  } catch (e) {
    console.warn('[Progression] Bottom-Up: Exercise fetch failed, falling back to keyword matching:', e);
  }

  // ── 3. Classify exercises to child programs (slug-resolved, keyword fallback)
  const childBuckets: Record<string, WorkoutExerciseResult[]> = {};
  for (const slug of childSlugs) {
    childBuckets[slug] = [];
  }

  for (const ex of exercises) {
    const fsExercise = exerciseLookup.get(ex.exerciseId) ?? null;
    const result = classifyExerciseToChild(ex.exerciseName, ex.programLevels, childSlugs, fsExercise, slugMap);
    if (result.childSlug && childBuckets[result.childSlug]) {
      childBuckets[result.childSlug].push(ex);
      const resolvedInfo = result.resolvedFrom
        ? ` (resolved from ID: ${result.resolvedFrom})`
        : '';
      console.log(`[Progression] Bottom-Up: Classified "${ex.exerciseName}" → "${result.childSlug}" via ${result.tier}${resolvedInfo}`);
    } else {
      const rawIds = fsExercise?.programIds?.map(pid => {
        const resolved = slugMap?.idToSlug.get(pid);
        return resolved ? `${pid} → ${resolved}` : pid;
      }).join(', ') ?? 'N/A';
      console.log(`[Progression] Bottom-Up: "${ex.exerciseName}" UNCLASSIFIED — programIds: [${rawIds}]`);
    }
  }

  // ── 4. Calculate gain per child using its own Firestore rule ─────────────
  const childGains: ChildDomainGain[] = [];
  let totalSetsPerformed = 0;
  let totalRequiredSets = 0;

  for (const childId of childSlugs) {
    const childExercises = childBuckets[childId] || [];
    const childTrack = updatedTracks[childId] || getDefaultTrackProgress();
    const childLevel = childTrack.currentLevel;
    const childRule = await getProgressionRuleForLevel(childId, childLevel);

    const childSets = childExercises.reduce((s, e) => s + e.setsCompleted, 0);
    totalSetsPerformed += childSets;
    totalRequiredSets += childRule.requiredSetsForFullGain;

    if (childSets === 0) {
      childGains.push({
        childId,
        label: CHILD_LABELS[childId] || childId,
        baseGain: 0,
        bonusGain: 0,
        totalGain: 0,
        setsPerformed: 0,
        requiredSets: childRule.requiredSetsForFullGain,
        volumeRatio: 0,
        leveledUp: false,
        newPercent: childTrack.percent,
      });
      continue;
    }

    // Pay-as-you-go: linear (Completed/Target) × baseGain
    const childVolumeRatio = Math.min(1, childSets / childRule.requiredSetsForFullGain);
    const childBaseGain = childVolumeRatio * childRule.baseSessionGain;

    const childPerfRatio = calculatePerformanceRatio(childExercises);
    let childBonusGain = 0;
    if (childPerfRatio > 1) {
      const excessPercent = (childPerfRatio - 1) * 100;
      childBonusGain = Math.min(
        excessPercent * (childRule.bonusPercent / 100),
        childRule.bonusPercent,
      ) * childVolumeRatio;
    }

    const childTotalGain = childBaseGain + childBonusGain;

    // Apply to child track
    const childNewPercent = childTrack.percent + childTotalGain;
    let childLeveledUp = false;
    let childNewLevel = childLevel;

    if (childNewPercent >= 100) {
      childNewLevel = childLevel + 1;
      childLeveledUp = true;
      updatedTracks[childId] = {
        currentLevel: childNewLevel,
        percent: childNewPercent - 100,
        lastWorkoutDate: completedAt,
        totalWorkoutsCompleted: (childTrack.totalWorkoutsCompleted || 0) + 1,
        completedGoalIds: [],
      };
    } else {
      updatedTracks[childId] = {
        ...childTrack,
        percent: childNewPercent,
        lastWorkoutDate: completedAt,
        totalWorkoutsCompleted: (childTrack.totalWorkoutsCompleted || 0) + 1,
      };
    }

    childGains.push({
      childId,
      label: CHILD_LABELS[childId] || childId,
      baseGain: childBaseGain,
      bonusGain: childBonusGain,
      totalGain: childTotalGain,
      setsPerformed: childSets,
      requiredSets: childRule.requiredSetsForFullGain,
      volumeRatio: childVolumeRatio,
      leveledUp: childLeveledUp,
      newLevel: childLeveledUp ? childNewLevel : undefined,
      newPercent: childLeveledUp ? childNewPercent - 100 : childNewPercent,
    });

    console.log(
      `[Progression] Bottom-Up: "${childId}" L${childLevel} → ` +
      `base=${childBaseGain.toFixed(1)}%, bonus=${childBonusGain.toFixed(1)}%, total=${childTotalGain.toFixed(1)}% ` +
      `(${childSets}/${childRule.requiredSetsForFullGain} sets, rule: ${childRule.baseSessionGain}% base)` +
      (childLeveledUp ? ` → LEVEL UP to ${childNewLevel}!` : ` (now ${updatedTracks[childId].percent.toFixed(1)}%)`),
    );
  }

  // ── 5. Volume-weighted master gain ──────────────────────────────────────
  // Weight each child's gain by its share of the total session volume.
  // If 90 % of sets were Push, Push accounts for 90 % of the master gain.
  const totalSessionSets = childGains.reduce((s, c) => s + c.setsPerformed, 0);

  let masterBaseGain: number;
  let masterBonusGain: number;

  if (totalSessionSets > 0) {
    masterBaseGain  = childGains.reduce((s, c) => s + c.baseGain  * c.setsPerformed, 0) / totalSessionSets;
    masterBonusGain = childGains.reduce((s, c) => s + c.bonusGain * c.setsPerformed, 0) / totalSessionSets;
  } else {
    masterBaseGain  = 0;
    masterBonusGain = 0;
  }
  const masterTotalGain = masterBaseGain + masterBonusGain;

  // Update the master track (will be overwritten by recalculateMasterLevel for consistency)
  const masterTrack = updatedTracks[activeProgramId] || getDefaultTrackProgress();
  const masterNewPercent = masterTrack.percent + masterTotalGain;
  let masterLeveledUp = false;
  let masterNewLevel = masterTrack.currentLevel;

  if (masterNewPercent >= 100) {
    masterNewLevel = masterTrack.currentLevel + 1;
    masterLeveledUp = true;
    updatedTracks[activeProgramId] = {
      currentLevel: masterNewLevel,
      percent: masterNewPercent - 100,
      lastWorkoutDate: completedAt,
      totalWorkoutsCompleted: (masterTrack.totalWorkoutsCompleted || 0) + 1,
      completedGoalIds: [],
    };
  } else {
    updatedTracks[activeProgramId] = {
      ...masterTrack,
      percent: masterNewPercent,
      lastWorkoutDate: completedAt,
      totalWorkoutsCompleted: (masterTrack.totalWorkoutsCompleted || 0) + 1,
    };
  }

  console.log(
    `[Progression] Bottom-Up MASTER: "${activeProgramId}" → total=${masterTotalGain.toFixed(1)}% ` +
    `(volume-weighted across ${totalSessionSets} sets, ${childGains.filter(c => c.totalGain > 0).length}/${childSlugs.length} domains active)` +
    (masterLeveledUp ? ` → LEVEL UP to ${masterNewLevel}!` : ` (now ${updatedTracks[activeProgramId].percent.toFixed(1)}%)`),
  );

  // ── 4. Save all tracks to Firestore ─────────────────────────────────────
  const trackWriteSucceededBottomUp = await updateProgressionTracks(userId, updatedTracks);
  if (!trackWriteSucceededBottomUp) {
    console.error('[Progression] Bottom-Up: updateProgressionTracks failed — gains are local-only');
  }

  // ── 5. Recalculate master level from children for DB consistency ─────────
  try {
    for (const child of childGains) {
      if (child.totalGain > 0) {
        await recalculateAncestorMasters(userId, child.childId);
      }
    }
  } catch (e) {
    console.error('[Progression] Bottom-Up: Failed to recalculate master levels:', e);
  }

  // ── 6. Level equivalence for children that leveled up ───────────────────
  try {
    for (const child of childGains) {
      if (child.leveledUp && child.newLevel) {
        await applyLevelEquivalences(userId, child.childId, child.newLevel);
      }
    }
    if (masterLeveledUp) {
      await applyLevelEquivalences(userId, activeProgramId, masterNewLevel);
    }
  } catch (e) {
    console.error('[Progression] Bottom-Up: Level equivalences failed:', e);
  }

  // ── 7. Ready for split check ────────────────────────────────────────────
  const readyForSplit = checkReadyForSplit(updatedTracks, activeProgramId, masterNewLevel);
  if (readyForSplit?.isReady) {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userDocRef, {
      'progression.readyForSplit': readyForSplit,
      updatedAt: serverTimestamp(),
    });
  }

  // ── 7b. Program Evolution Engine ──────────────────────────────────────
  const pendingEvolution = evaluateProgramEvolution(updatedTracks, activeProgramId, masterNewLevel);
  if (pendingEvolution) {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userDocRef, {
      'progression.pendingProgramEvolution': pendingEvolution,
      updatedAt: serverTimestamp(),
    });
    console.log(
      `[Evolution Engine] Triggered: ${activeProgramId} L${masterNewLevel} → ${pendingEvolution.targetSplit}`,
      `(sub-levels: ${JSON.stringify(pendingEvolution.subLevelsSnapshot)})`,
    );
  }

  // ── 8. Build result ─────────────────────────────────────────────────────
  const volumeBreakdown: VolumeBreakdown = {
    setsPerformed: totalSetsPerformed,
    requiredSets: Math.max(1, totalRequiredSets),
    volumeRatio: totalRequiredSets > 0 ? Math.min(1, totalSetsPerformed / totalRequiredSets) : 0,
    isFullVolume: totalSetsPerformed >= totalRequiredSets,
  };

  const linkedProgramGains = childGains
    .filter(c => c.totalGain > 0)
    .map(c => ({
      programId: c.childId,
      gain: c.totalGain,
      newPercent: c.newPercent,
      leveledUp: c.leveledUp,
      newLevel: c.newLevel,
    }));

  const sessionCompletionPercent = Math.round(
    (totalRequiredSets > 0 ? Math.min(1, totalSetsPerformed / totalRequiredSets) : 0) * 100,
  );

  return {
    success: true,
    activeProgramGain: {
      programId: activeProgramId,
      baseGain: masterBaseGain,
      bonusGain: masterBonusGain,
      goalBonusGain: 0,
      // Master programs aggregate child contributions; mastery is awarded
      // at the leaf-program level only (where the skill ID is concrete).
      masteryBonusGain: 0,
      totalGain: masterTotalGain,
      newPercent: masterLeveledUp ? masterNewPercent - 100 : masterNewPercent,
      leveledUp: masterLeveledUp,
      newLevel: masterLeveledUp ? masterNewLevel : undefined,
    },
    linkedProgramGains,
    volumeBreakdown,
    readyForSplit,
    sessionCompletionPercent,
    goalProgress: [],
    muscleGroupProgress: buildMuscleGroupProgress(exercises),
    childDomainGains: childGains,
    trackWriteSucceeded: trackWriteSucceededBottomUp,
  };
}

// ============================================================================
// MAIN: WORKOUT COMPLETION PROCESSING
// ============================================================================

/**
 * Process workout completion with multi-program progression
 * 
 * For MASTER programs (e.g., full_body): uses bottom-up child aggregation.
 * For LEAF programs (e.g., push): uses direct rule lookup.
 * 
 * @param data - Workout completion data
 * @returns Promise<WorkoutCompletionResult>
 */
export async function processWorkoutCompletion(
  data: WorkoutCompletionData
): Promise<WorkoutCompletionResult> {
  try {
    const { userId, activeProgramId, exercises, completedAt } = data;
    
    // Fetch user profile
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;
    
    // Ensure tracks are initialized
    ensureTracksInitialized(progression);

    // ── MASTER PROGRAM DETECTION: Bottom-Up Aggregation ───────────────────
    // Master programs (e.g., full_body) do NOT have their own progression rules.
    // Their gain is calculated bottom-up from child programs.
    // Three-tier detection: direct doc → query by isMaster → hardcoded fallback.
    let masterProgram: Program | null = null;

    // Tier 1: Direct document lookup (works if doc ID === activeProgramId)
    try {
      masterProgram = await getProgram(activeProgramId);
      if (masterProgram && !masterProgram.isMaster) {
        masterProgram = null;
      }
    } catch (e) {
      console.warn('[Progression] Tier 1 master lookup failed:', e);
    }

    // Tier 2: Query all master programs and match by ID or slug
    if (!masterProgram) {
      try {
        const q = query(collection(db, PROGRAMS_COLLECTION), where('isMaster', '==', true));
        const snapshot = await getDocs(q);
        const masters = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Program));
        const slug = activeProgramId.toLowerCase().replace(/[\s-]+/g, '_');
        masterProgram = masters.find(m =>
          m.id === activeProgramId ||
          m.name?.toLowerCase().replace(/[\s-]+/g, '_') === slug
        ) ?? null;
        if (masterProgram) {
          console.log(`[Progression] Tier 2: Matched master "${masterProgram.name}" (doc ID: ${masterProgram.id}) for slug "${activeProgramId}"`);
        }
      } catch (e) {
        console.warn('[Progression] Tier 2 master query failed:', e);
      }
    }

    // Tier 3: Hardcoded known masters (bulletproof fallback)
    if (!masterProgram && KNOWN_MASTER_PROGRAMS[activeProgramId]) {
      masterProgram = {
        id: activeProgramId,
        isMaster: true,
        subPrograms: KNOWN_MASTER_PROGRAMS[activeProgramId],
        name: activeProgramId.replace(/_/g, ' '),
      } as Program;
      console.log(`[Progression] Tier 3: Using hardcoded master config for "${activeProgramId}" → children [${masterProgram.subPrograms!.join(', ')}]`);
    }

    if (masterProgram?.isMaster && masterProgram.subPrograms?.length) {
      console.log(`[Progression] "${activeProgramId}" is a MASTER → delegating to bottom-up flow`);
      return processBottomUpMasterCompletion(data, userData, masterProgram, progression);
    }

    // ── LEAF PROGRAM FLOW (unchanged) ─────────────────────────────────────
    // Get current track for active program
    const currentTrack = progression.tracks?.[activeProgramId] || getDefaultTrackProgress();
    const currentLevel = currentTrack.currentLevel;
    
    // Get progression rule for this level
    const rule = await getProgressionRuleForLevel(activeProgramId, currentLevel);
    
    // Calculate total sets performed
    const setsPerformed = calculateTotalSetsPerformed(exercises);
    const requiredSets = rule.requiredSetsForFullGain;
    
    // Pay-as-you-go: strictly linear — (Completed Sets / Target Sets) × Total Possible Gain.
    // minSets is ignored; 1 set with target 10 = 10% of session progress.
    const volumeRatio = Math.min(1, setsPerformed / requiredSets);
    
    // Calculate volume breakdown for Dopamine Screen
    const volumeBreakdown = calculateVolumeBreakdown(setsPerformed, requiredSets);
    
    // Calculate performance ratio for bonus
    const performanceRatio = calculatePerformanceRatio(exercises);
    
    // Base gain: linear proportion of baseSessionGain (no minSets gate)
    const baseGain = volumeRatio * rule.baseSessionGain;
    
    // Apply bonus if exceeding target reps
    let bonusGain = 0;
    if (performanceRatio > 1) {
      const excessPercent = (performanceRatio - 1) * 100;
      // Bonus is also scaled by volume ratio
      bonusGain = Math.min(excessPercent * (rule.bonusPercent / 100), rule.bonusPercent) * volumeRatio;
    }
    
    // ── MANUAL WEIGHTED PROGRESS: Each goal carries its own admin-defined progressBonus ──
    // Strict logic: actualValue >= targetValue → add the exact progressBonus.
    //              actualValue < targetValue  → add 0%.
    // Fallback: if a goal has no progressBonus defined, default to 5%.
    let goalBonusGain = 0;
    const newlyCompletedGoalIds: string[] = [];
    const DEFAULT_PROGRESS_BONUS = 5; // Fallback for goals without admin-defined progressBonus

    try {
      const levelSettings = await getProgramLevelSetting(activeProgramId, currentLevel);
      const levelGoals: LevelGoal[] = levelSettings?.targetGoals || [];
      const alreadyCompleted = new Set(currentTrack.completedGoalIds || []);

      for (const goal of levelGoals) {
        const bonus = (goal as any).progressBonus ?? DEFAULT_PROGRESS_BONUS;

        // Find matching exercise in this workout's results
        const match = exercises.find(
          (ex) =>
            ex.exerciseId === goal.exerciseId ||
            ex.exerciseName.toLowerCase().includes(goal.exerciseName.toLowerCase()),
        );
        if (!match) {
          console.log(`[Progression] Goal "${goal.exerciseName}": not in workout → +0%`);
          continue;
        }

        // Evaluate: best set value vs target
        const bestValue =
          goal.unit === 'reps'
            ? Math.max(...match.repsPerSet, 0)
            : match.repsPerSet.reduce((sum, r) => sum + r, 0); // total hold seconds

        if (bestValue >= goal.targetValue) {
          // STRICT: goal met → award full progressBonus
          goalBonusGain += bonus;
          if (!alreadyCompleted.has(goal.exerciseId)) {
            newlyCompletedGoalIds.push(goal.exerciseId);
          }
          console.log(
            `[Progression] Goal "${goal.exerciseName}": ${bestValue}/${goal.targetValue} ${goal.unit}` +
              ` ✅ MET → +${bonus}%`,
          );
        } else {
          // STRICT: goal not met → 0%
          console.log(
            `[Progression] Goal "${goal.exerciseName}": ${bestValue}/${goal.targetValue} ${goal.unit}` +
              ` ❌ NOT MET → +0% (needed ${goal.targetValue}, bonus would be ${bonus}%)`,
          );
        }
      }

      if (goalBonusGain > 0) {
        console.log(
          `[Progression] Goal bonus total: +${goalBonusGain}%` +
            ` (${newlyCompletedGoalIds.length} goals fully achieved)`,
        );
      }
    } catch (e) {
      console.error('[Progression] Failed to evaluate goal bonus (non-blocking):', e);
    }

    // ── SKILL MASTERY BONUS ────────────────────────────────────────────────
    // Awards a one-time +17.5% bonus when the user achieves a physiological
    // mastery threshold inside a Skill program. Skills are technique-driven
    // movements (planche, front lever, muscle-up, handstand) where 5 reps or
    // 10s of clean execution represents a genuine mastery moment that
    // deserves accelerated progression — independent from the standard
    // base/bonus/goal pipeline.
    //
    // Evaluation:
    //   - bilateral skill (rep-based) → bestSet ≥ 5 reps
    //   - isometric skill (time-based) → totalHold ≥ 10 seconds
    //
    // Only fires once per session (we break on the first qualifying exercise)
    // because mastery is a session-level event, not a per-exercise reward.
    const SKILL_PROGRAMS = new Set([
      'front_lever',
      'planche',
      'muscle_up',
      'handstand',
      'hspu',
      'back_lever',
      'human_flag',
      'one_arm_pullup',
      'one_arm_pushup',
    ]);
    const SKILL_REP_THRESHOLD = 5;     // 5 clean bilateral reps
    const SKILL_HOLD_THRESHOLD = 10;   // 10s isometric hold
    const SKILL_MASTERY_BONUS = 17.5;  // midpoint of the agreed 15-20% band
    const ISOMETRIC_HEURISTIC_REPS = 5; // any single "rep" ≥ 5 implies a hold log

    let masteryBonusGain = 0;
    let masteryTriggerExercise: string | null = null;

    if (SKILL_PROGRAMS.has(activeProgramId)) {
      for (const ex of exercises) {
        if (ex.repsPerSet.length === 0) continue;

        // Heuristic: holds (time-based) typically log values >= 5 across all
        // sets (since 5s is the minimum meaningful hold), while bodyweight
        // skill reps cluster around 1-5. We treat a set whose every value
        // is >= 5 as a hold log.
        const isLikelyHold = ex.repsPerSet.every(r => r >= ISOMETRIC_HEURISTIC_REPS);
        if (isLikelyHold) {
          const totalHold = ex.repsPerSet.reduce((s, r) => s + r, 0);
          if (totalHold >= SKILL_HOLD_THRESHOLD) {
            masteryBonusGain = SKILL_MASTERY_BONUS;
            masteryTriggerExercise = `${ex.exerciseName} (${totalHold}s hold)`;
            break;
          }
        } else {
          const bestSet = Math.max(...ex.repsPerSet, 0);
          if (bestSet >= SKILL_REP_THRESHOLD) {
            masteryBonusGain = SKILL_MASTERY_BONUS;
            masteryTriggerExercise = `${ex.exerciseName} (${bestSet} reps)`;
            break;
          }
        }
      }

      if (masteryBonusGain > 0 && masteryTriggerExercise) {
        console.log(
          `[Progression] 🏆 SKILL MASTERY in "${activeProgramId}": +${masteryBonusGain}% from ${masteryTriggerExercise}`,
        );
      } else {
        console.log(
          `[Progression] Skill mastery threshold not met for "${activeProgramId}" this session`,
        );
      }
    }

    const totalGain = baseGain + bonusGain + goalBonusGain + masteryBonusGain;
    
    // Update active program track
    const updatedTracks = { ...progression.tracks };
    
    const newPercent = currentTrack.percent + totalGain;
    let leveledUp = false;
    let newLevel = currentLevel;
    
    // Merge newly completed goal IDs with previously completed ones
    const mergedCompletedGoalIds = [
      ...(currentTrack.completedGoalIds || []),
      ...newlyCompletedGoalIds,
    ];

    if (newPercent >= 100) {
      // Level up! Reset completedGoalIds for the new level's fresh goals.
      newLevel = currentLevel + 1;
      leveledUp = true;
      updatedTracks[activeProgramId] = {
        currentLevel: newLevel,
        percent: newPercent - 100, // Carry over excess
        lastWorkoutDate: completedAt,
        totalWorkoutsCompleted: (currentTrack.totalWorkoutsCompleted || 0) + 1,
        completedGoalIds: [], // Fresh slate for new level
      };
    } else {
      updatedTracks[activeProgramId] = {
        ...currentTrack,
        percent: newPercent,
        lastWorkoutDate: completedAt,
        totalWorkoutsCompleted: (currentTrack.totalWorkoutsCompleted || 0) + 1,
        completedGoalIds: mergedCompletedGoalIds,
      };
    }
    
    // Process linked programs
    const linkedProgramGains: WorkoutCompletionResult['linkedProgramGains'] = [];
    
    // Get linked programs from rule AND detected from exercises
    const ruleLinkedPrograms = rule.linkedPrograms || [];
    const detectedLinkedPrograms = detectLinkedProgramsFromExercises(exercises, activeProgramId);
    
    // Combine linked programs (rule takes priority for multiplier)
    const allLinkedPrograms = new Map<string, number>();
    
    // Add rule-defined linked programs
    for (const lp of ruleLinkedPrograms) {
      allLinkedPrograms.set(lp.targetProgramId, lp.multiplier);
    }
    
    // Add detected linked programs with volume-based multiplier
    Array.from(detectedLinkedPrograms).forEach(programId => {
      if (!allLinkedPrograms.has(programId)) {
        const volumeContribution = calculateVolumeContribution(exercises, programId);
        // Default multiplier is 50% of volume contribution
        allLinkedPrograms.set(programId, volumeContribution * 0.5);
      }
    });
    
    // Apply gains to linked programs
    Array.from(allLinkedPrograms.entries()).forEach(([linkedProgramId, multiplier]) => {
      const linkedTrack = updatedTracks[linkedProgramId] || getDefaultTrackProgress();
      const linkedGain = totalGain * multiplier;
      
      const linkedNewPercent = linkedTrack.percent + linkedGain;
      let linkedLeveledUp = false;
      let linkedNewLevel = linkedTrack.currentLevel;
      
      if (linkedNewPercent >= 100) {
        linkedNewLevel = linkedTrack.currentLevel + 1;
        linkedLeveledUp = true;
        updatedTracks[linkedProgramId] = {
          currentLevel: linkedNewLevel,
          percent: linkedNewPercent - 100,
          lastWorkoutDate: completedAt,
          totalWorkoutsCompleted: (linkedTrack.totalWorkoutsCompleted || 0) + 1,
        };
      } else {
        updatedTracks[linkedProgramId] = {
          ...linkedTrack,
          percent: linkedNewPercent,
          lastWorkoutDate: completedAt,
          totalWorkoutsCompleted: (linkedTrack.totalWorkoutsCompleted || 0) + 1,
        };
      }
      
      linkedProgramGains.push({
        programId: linkedProgramId,
        gain: linkedGain,
        newPercent: linkedLeveledUp ? linkedNewPercent - 100 : linkedNewPercent,
        leveledUp: linkedLeveledUp,
        newLevel: linkedLeveledUp ? linkedNewLevel : undefined,
      });
    });
    
    // ── MASTER-TO-CHILD PROPAGATION ──────────────────────────────────────
    // When the active program is a MASTER (e.g., full_body), distribute
    // proportional gains to its child tracks (push, pull, legs, core)
    // based on which movement groups the exercises belong to.
    // Use getProgramByTemplateId (not getProgram) so that slug-based IDs
    // like 'full_body' resolve correctly via Strategy 4.
    try {
      const masterProgram = await getProgramByTemplateId(activeProgramId);
      if (masterProgram?.isMaster && masterProgram.subPrograms?.length) {
        const childProgramIds = masterProgram.subPrograms;

        // Classify each exercise by movement group → child program
        const childVolume: Record<string, { sets: number; reps: number }> = {};
        for (const childId of childProgramIds) {
          childVolume[childId] = { sets: 0, reps: 0 };
        }

        for (const ex of exercises) {
          const name = ex.exerciseName.toLowerCase();
          let matchedChild: string | null = null;

          // Match exercise to child by movement keywords
          if (name.includes('pull') || name.includes('row') || name.includes('chin') || name.includes('curl') || name.includes('משיכ') || name.includes('מתח')) {
            matchedChild = childProgramIds.find(id => id.includes('pull')) || null;
          } else if (name.includes('squat') || name.includes('lunge') || name.includes('leg') || name.includes('calf') || name.includes('רגל') || name.includes('סקוואט') || name.includes('ירך')) {
            matchedChild = childProgramIds.find(id => id.includes('leg')) || null;
          } else if (name.includes('plank') || name.includes('core') || name.includes('abs') || name.includes('ליבה') || name.includes('בטן')) {
            matchedChild = childProgramIds.find(id => id.includes('core')) || null;
          } else if (name.includes('push') || name.includes('press') || name.includes('dip') || name.includes('fly') || name.includes('דחיפ') || name.includes('שכיב') || name.includes('לחיצ')) {
            matchedChild = childProgramIds.find(id => id.includes('push')) || null;
          }

          // Also check exercise.programLevels for explicit child assignment
          if (!matchedChild) {
            for (const childId of childProgramIds) {
              if (ex.programLevels?.[childId] !== undefined) {
                matchedChild = childId;
                break;
              }
            }
          }

          if (matchedChild && childVolume[matchedChild]) {
            childVolume[matchedChild].sets += ex.setsCompleted;
            childVolume[matchedChild].reps += ex.repsPerSet.reduce((s, r) => s + r, 0);
          }
        }

        // Distribute proportional gains to each child that has volume
        const totalChildSets = Object.values(childVolume).reduce((s, v) => s + v.sets, 0);
        if (totalChildSets > 0) {
          for (const [childId, vol] of Object.entries(childVolume)) {
            if (vol.sets === 0) continue;

            const proportion = vol.sets / totalChildSets;
            const childGain = totalGain * proportion;

            const childTrack = updatedTracks[childId] || getDefaultTrackProgress();
            const childNewPercent = childTrack.percent + childGain;
            let childLeveledUp = false;
            let childNewLevel = childTrack.currentLevel;

            if (childNewPercent >= 100) {
              childNewLevel = childTrack.currentLevel + 1;
              childLeveledUp = true;
              updatedTracks[childId] = {
                currentLevel: childNewLevel,
                percent: childNewPercent - 100,
                lastWorkoutDate: completedAt,
                totalWorkoutsCompleted: (childTrack.totalWorkoutsCompleted || 0) + 1,
                completedGoalIds: [],
              };
            } else {
              updatedTracks[childId] = {
                ...childTrack,
                percent: childNewPercent,
                lastWorkoutDate: completedAt,
                totalWorkoutsCompleted: (childTrack.totalWorkoutsCompleted || 0) + 1,
              };
            }

            linkedProgramGains.push({
              programId: childId,
              gain: childGain,
              newPercent: childLeveledUp ? childNewPercent - 100 : childNewPercent,
              leveledUp: childLeveledUp,
              newLevel: childLeveledUp ? childNewLevel : undefined,
            });

            console.log(
              `[Progression] Master→Child: "${childId}" +${childGain.toFixed(1)}% (${vol.sets} sets, ${Math.round(proportion * 100)}% of volume)` +
              (childLeveledUp ? ` → LEVEL UP to ${childNewLevel}!` : ` (now ${updatedTracks[childId].percent.toFixed(1)}%)`),
            );
          }
        }
      }
    } catch (e) {
      console.error('[Progression] Master-to-child propagation failed (non-blocking):', e);
    }

    // Save updated tracks to Firestore
    const trackWriteSucceeded = await updateProgressionTracks(userId, updatedTracks);
    if (!trackWriteSucceeded) {
      console.error('[Progression] Leaf: updateProgressionTracks failed — gains are local-only');
    }

    // ✅ LEVEL GOAL PROGRESS: Persist detailed goal performance so the Home
    //    dashboard can render real checkmarks (not just track-level IDs).
    try {
      const levelSettings = await getProgramLevelSetting(activeProgramId, leveledUp ? currentLevel : newLevel);
      const allGoals: LevelGoal[] = levelSettings?.targetGoals || [];
      if (allGoals.length > 0) {
        const goalProgressEntries = allGoals.map((goal) => {
          const match = exercises.find(
            (ex) =>
              ex.exerciseId === goal.exerciseId ||
              ex.exerciseName.toLowerCase().includes(goal.exerciseName.toLowerCase()),
          );
          const bestValue = match
            ? goal.unit === 'reps'
              ? Math.max(...match.repsPerSet, 0)
              : match.repsPerSet.reduce((sum, r) => sum + r, 0)
            : 0;
          return {
            exerciseId: goal.exerciseId,
            exerciseName: goal.exerciseName,
            targetValue: goal.targetValue,
            unit: goal.unit,
            bestPerformance: bestValue,
            lastAttemptDate: new Date(),
            completionPercent: Math.min(100, Math.round((bestValue / goal.targetValue) * 100)),
            isCompleted: bestValue >= goal.targetValue,
          };
        });

        // Upsert into the levelGoalProgress array keyed by programId + level
        const levelKey = `${activeProgramId}_level_${leveledUp ? currentLevel : newLevel}`;
        const userDocRef2 = doc(db, USERS_COLLECTION, userId);
        const snap = await getDoc(userDocRef2);
        const existingArr: any[] = snap.data()?.progression?.levelGoalProgress || [];
        // Replace entry for this level key, or append
        const idx = existingArr.findIndex((e: any) => e.levelId === levelKey);
        const entry = {
          levelId: levelKey,
          levelName: `רמה ${leveledUp ? currentLevel : newLevel}`,
          goals: goalProgressEntries,
        };
        if (idx >= 0) {
          // Merge: keep best performance across sessions
          const existing = existingArr[idx];
          for (const g of entry.goals) {
            const prev = existing.goals?.find((eg: any) => eg.exerciseId === g.exerciseId);
            if (prev && prev.bestPerformance > g.bestPerformance) {
              g.bestPerformance = prev.bestPerformance;
              g.completionPercent = Math.min(100, Math.round((g.bestPerformance / g.targetValue) * 100));
              g.isCompleted = g.bestPerformance >= g.targetValue;
            }
          }
          existingArr[idx] = entry;
        } else {
          existingArr.push(entry);
        }
        await updateDoc(userDocRef2, {
          'progression.levelGoalProgress': existingArr,
        });
        console.log(`[Progression] levelGoalProgress updated for ${levelKey}`);
      }
    } catch (e) {
      console.error('[Progression] Failed to update levelGoalProgress (non-blocking):', e);
    }

    // ✅ Recalculate all ancestor master programs after child track update
    // This keeps the Parent→Child hierarchy in sync (e.g., Push workout → Upper Body → Full Body)
    try {
      await recalculateAncestorMasters(userId, activeProgramId);
      // Also recalculate for linked programs that received gains
      for (const linked of linkedProgramGains) {
        await recalculateAncestorMasters(userId, linked.programId);
      }
    } catch (e) {
      console.error('[Progression] Failed to recalculate master levels:', e);
    }

    // ✅ LEVEL EQUIVALENCE: Check if any level-ups unlock/set levels in other programs
    // e.g., Push Lvl 15 → Planche Lvl 4
    try {
      if (leveledUp) {
        const equivalences = await applyLevelEquivalences(userId, activeProgramId, newLevel);
        if (equivalences.length > 0) {
          console.log(`[Progression] Level equivalences applied:`,
            equivalences.map(eq => `${eq.targetProgramId} → Lvl ${eq.newLevel}`).join(', '));
        }
      }
      // Also check linked programs that leveled up
      for (const linked of linkedProgramGains) {
        if (linked.leveledUp && linked.newLevel) {
          const linkedEquivalences = await applyLevelEquivalences(userId, linked.programId, linked.newLevel);
          if (linkedEquivalences.length > 0) {
            console.log(`[Progression] Linked equivalences applied:`,
              linkedEquivalences.map(eq => `${eq.targetProgramId} → Lvl ${eq.newLevel}`).join(', '));
          }
        }
      }
    } catch (e) {
      console.error('[Progression] Failed to apply level equivalences:', e);
    }
    
    // Check for Ready for Split
    const readyForSplit = checkReadyForSplit(updatedTracks, activeProgramId, newLevel);
    
    // If ready for split, save flag to user profile
    if (readyForSplit?.isReady) {
      await updateDoc(userDocRef, {
        'progression.readyForSplit': readyForSplit,
        updatedAt: serverTimestamp(),
      });
    }
    
    // ── PROFESSIONAL PROGRESS COMPONENTS ──────────────────────────────────

    // 1. Session Completion % — based on sets completed vs required
    const sessionCompletionPercent = Math.round(volumeRatio * 100);

    // 2. Goal Progress — detailed per-goal breakdown
    const goalProgress: import('../../core/types/progression.types').GoalProgressEntry[] = [];
    try {
      const levelSettingsForGoals = await getProgramLevelSetting(activeProgramId, currentLevel);
      const goalsForReport: LevelGoal[] = levelSettingsForGoals?.targetGoals || [];
      for (const goal of goalsForReport) {
        const match = exercises.find(
          (ex) =>
            ex.exerciseId === goal.exerciseId ||
            ex.exerciseName.toLowerCase().includes(goal.exerciseName.toLowerCase()),
        );
        const bestValue = match
          ? goal.unit === 'reps'
            ? Math.max(...match.repsPerSet, 0)
            : match.repsPerSet.reduce((sum, r) => sum + r, 0)
          : 0;
        goalProgress.push({
          exerciseId: goal.exerciseId,
          exerciseName: goal.exerciseName,
          targetValue: goal.targetValue,
          actualValue: bestValue,
          unit: goal.unit,
          progressBonus: (goal as any).progressBonus ?? 5,
          achieved: bestValue >= goal.targetValue,
        });
      }
    } catch (e) {
      console.warn('[Progression] Failed to build goal progress report:', e);
    }

    // 3. Muscle Group Progress — Push / Pull / Legs / Core
    const muscleGroupProgress = buildMuscleGroupProgress(exercises);

    return {
      success: true,
      activeProgramGain: {
        programId: activeProgramId,
        baseGain,
        bonusGain,
        goalBonusGain,
        masteryBonusGain,
        totalGain,
        newPercent: leveledUp ? newPercent - 100 : newPercent,
        leveledUp,
        newLevel: leveledUp ? newLevel : undefined,
        newlyCompletedGoalIds: newlyCompletedGoalIds.length > 0 ? newlyCompletedGoalIds : undefined,
      },
      linkedProgramGains,
      volumeBreakdown,
      readyForSplit,
      sessionCompletionPercent,
      goalProgress,
      muscleGroupProgress,
      trackWriteSucceeded,
    };
    
  } catch (error) {
    console.error('Error processing workout completion:', error);
    return {
      success: false,
      activeProgramGain: {
        programId: data.activeProgramId,
        baseGain: 0,
        bonusGain: 0,
        goalBonusGain: 0,
        masteryBonusGain: 0,
        totalGain: 0,
        newPercent: 0,
        leveledUp: false,
      },
      linkedProgramGains: [],
      volumeBreakdown: {
        setsPerformed: 0,
        requiredSets: 4,
        volumeRatio: 0,
        isFullVolume: false,
      },
      sessionCompletionPercent: 0,
      goalProgress: [],
      muscleGroupProgress: [],
      trackWriteSucceeded: false,
    };
  }
}

/**
 * Get user's ready for split status
 */
export async function getReadyForSplitStatus(userId: string): Promise<ReadyForSplitStatus | null> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      return null;
    }
    
    const userData = userDoc.data() as UserFullProfile & { progression?: { readyForSplit?: ReadyForSplitStatus } };
    return userData.progression?.readyForSplit || null;
  } catch (error) {
    console.error('Error getting ready for split status:', error);
    return null;
  }
}

/**
 * Dismiss ready for split recommendation
 */
export async function dismissReadyForSplit(userId: string): Promise<boolean> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userDocRef, {
      'progression.readyForSplit.isReady': false,
      'progression.readyForSplit.dismissedAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error dismissing ready for split:', error);
    return false;
  }
}
