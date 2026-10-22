/**
 * levelup-inputs — READ-ONLY loader for the level-up screen (enable_levelup_v2).
 *
 * Loads, before the workout ends, everything the pure preview
 * (levelup-preview.ts) needs to show the result the moment the user taps
 * "finish": the user's tracks, the rule(s) for the current level, the level
 * goals and — for a master program — each child's rule, the exercise docs and
 * the pre-session master average. Uses the service's own readers so the
 * inputs are exactly what processWorkoutCompletion will read.
 *
 * Never writes. Any failure → null (the screen shows its calm state and the
 * stored result reconciles when it lands).
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';
import type { WorkoutExerciseResult } from '../../core/types/progression.types';
import type { UserFullProfile } from '../../core/types/user.types';
import { hasAssessedStrengthDomain } from '../../identity/services/access-control.service';
import { readFeatureFlagOnce } from '@/lib/feature-flag-once';
import { loadLevelSettingsForGoals, resolveAdminRulesFlag } from './progression-admin-rules.loader';
import { getProgramByTemplateId } from '@/features/content/programs';
import {
  KNOWN_MASTER_PROGRAMS,
  buildProgramSlugMap,
  fetchExerciseLookup,
  getMasterProgramProgress,
  getProgressionRuleForLevel,
  resolveMasterProgram,
} from './progression.service';
import type { LevelPoint, LevelUpInputs, MasterAveraging, TrackSnapshot } from './levelup-preview';

type Tracks = Record<string, TrackSnapshot | undefined>;

function snapshot(t: TrackSnapshot | undefined): TrackSnapshot | undefined {
  if (!t || typeof t.currentLevel !== 'number') return undefined;
  return {
    currentLevel: t.currentLevel,
    percent: typeof t.percent === 'number' ? t.percent : 0,
    ...(t.completedGoalIds ? { completedGoalIds: [...t.completedGoalIds] } : {}),
    ...(typeof t.totalWorkoutsCompleted === 'number' ? { totalWorkoutsCompleted: t.totalWorkoutsCompleted } : {}),
    ...(typeof t.levelSessions === 'number' ? { levelSessions: t.levelSessions } : {}),
    ...(typeof t.monthKey === 'string' ? { monthKey: t.monthKey } : {}),
    ...(typeof t.monthSessions === 'number' ? { monthSessions: t.monthSessions } : {}),
  };
}

/**
 * The pre-session average of the Firestore master recalculateMasterLevel will
 * write (by doc id), with nested child masters (e.g. full_body → upper_body)
 * loaded too so the after-average can be re-run bottom-up.
 */
async function loadAveraging(uid: string, masterId: string, depth: number): Promise<MasterAveraging | null> {
  const progress = await getMasterProgramProgress(uid, masterId).catch(() => null);
  if (!progress?.averagingInputs) return null;
  const nested: Record<string, MasterAveraging> = {};
  if (depth < 2) {
    for (const sp of progress.subPrograms) {
      if (!KNOWN_MASTER_PROGRAMS[sp.programId]) continue;
      const child = await getProgramByTemplateId(sp.programId).catch(() => null);
      if (!child?.isMaster) continue;
      const n = await loadAveraging(uid, child.id, depth + 1);
      if (n) nested[sp.programId] = n;
    }
  }
  return {
    masterSlug: progress.averagingInputs.masterSlug,
    subPrograms: progress.subPrograms,
    configuredChildIds: progress.averagingInputs.configuredChildIds,
    ...(progress.averagingInputs.skillFocusIds ? { skillFocusIds: progress.averagingInputs.skillFocusIds } : {}),
    displayLevel: Math.max(progress.displayLevel, progress.priorMasterLevel ?? 0),
    displayPercent: progress.displayPercent,
    ...(Object.keys(nested).length ? { nested } : {}),
  };
}

export async function loadLevelUpInputs(
  uid: string,
  programId: string,
  planExerciseIds: string[],
): Promise<LevelUpInputs | null> {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) return null;
    const userData = userSnap.data() as UserFullProfile;

    // G8.2 — same gate as processWorkoutCompletion: no questionnaire → no level writes.
    if (!hasAssessedStrengthDomain(userData) && (await readFeatureFlagOnce('enable_no_auto_strength_level'))) {
      return { kind: 'skipped', programId };
    }

    const tracks = (userData.progression?.tracks ?? {}) as Tracks;
    // Same switch as processWorkoutCompletion → same rules, goals and bonuses.
    const adminRules = await resolveAdminRulesFlag(userData.core?.isSuperAdmin === true);
    const [slugMap, exerciseLookup] = await Promise.all([
      buildProgramSlugMap().catch(() => null),
      fetchExerciseLookup(
        Array.from(new Set(planExerciseIds)).map((exerciseId) => ({ exerciseId }) as WorkoutExerciseResult),
      ).catch(() => new Map()),
    ]);

    const master = await resolveMasterProgram(programId);
    if (master) {
      const childSlugs = master.subPrograms!.map((id) => slugMap?.idToSlug.get(id) ?? id);
      const rules = await Promise.all(
        childSlugs.map((slug) => getProgressionRuleForLevel(slug, tracks[slug]?.currentLevel ?? 1, slugMap, { adminRules })),
      );
      // The master recalculateMasterLevel writes is the Firestore doc (recalculateAncestorMasters
      // walks real master docs) — resolve the slug to it; the hardcoded tier-3 id is a fallback.
      const masterDoc = await getProgramByTemplateId(programId).catch(() => null);
      const masterId = masterDoc?.isMaster ? masterDoc.id : master.id;
      const avg = await loadAveraging(uid, masterId, 0);
      const averaging = avg
        ? {
            ...avg,
            ...(masterId !== programId && tracks[masterId] ? { hashKeyLevel: tracks[masterId]!.currentLevel } : {}),
          }
        : null;
      return {
        kind: 'master',
        programId,
        childSlugs,
        childTracks: Object.fromEntries(childSlugs.map((s) => [s, snapshot(tracks[s])])),
        childRules: Object.fromEntries(childSlugs.map((s, i) => [s, rules[i]])),
        exerciseLookup,
        idToSlug: slugMap?.idToSlug ?? null,
        masterTrack: snapshot(tracks[programId]),
        averaging,
        adminRules,
      };
    }

    const track = snapshot(tracks[programId]) ?? { currentLevel: 1, percent: 0 };
    const [rule, levelSettings] = await Promise.all([
      getProgressionRuleForLevel(programId, track.currentLevel, slugMap, { adminRules }),
      (adminRules
        ? loadLevelSettingsForGoals(programId, track.currentLevel, slugMap)
        : getProgramLevelSetting(programId, track.currentLevel)
      ).catch(() => null),
    ]);
    return {
      kind: 'leaf',
      programId,
      track,
      rule,
      goals: levelSettings?.targetGoals ?? [],
      oneTimeGoals: adminRules,
      adminRules,
    };
  } catch (e) {
    console.warn('[LevelUpV2] inputs load failed — calm state:', e);
    return null;
  }
}

/** Read back the stored master track after the writes (the number to reconcile to). */
export async function readStoredTrack(uid: string, keys: string[]): Promise<LevelPoint | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const tracks = (snap.data()?.progression?.tracks ?? {}) as Tracks;
    for (const k of keys) {
      const t = snapshot(tracks[k]);
      if (t) return { level: t.currentLevel, percent: t.percent };
    }
    return null;
  } catch {
    return null;
  }
}
