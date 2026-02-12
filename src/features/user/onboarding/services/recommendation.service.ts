/**
 * Recommendation Engine Service
 *
 * Generates contextual, actionable "Next Steps" recommendations based on
 * quiz results, user profile data, and system rules.
 *
 * Evaluates 5 recommendation types:
 *   1. ADD_ON         — Suggest a new program that complements the assigned one
 *   2. UPGRADE        — Suggest a level-up or split when thresholds are met
 *   3. COMPLEMENTARY  — Suggest balancing programs (e.g., Push → Pull)
 *   4. EQUIPMENT      — Suggest programs unlocked by user's available equipment
 *   5. GOAL_ALIGNED   — Suggest programs that align with the user's stated goals
 *
 * Also integrates with Level Equivalence rules to surface programs that are
 * already partially unlocked by the user's quiz-assigned levels.
 */

import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Program } from '@/features/content/programs/core/program.types';
import { getAllPrograms } from '@/features/content/programs/core/program.service';
import { LevelEquivalenceRule } from '@/features/user/core/types/progression.types';
import type { OnboardingData } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export type RecommendationType =
  | 'ADD_ON'
  | 'UPGRADE'
  | 'COMPLEMENTARY'
  | 'EQUIPMENT'
  | 'GOAL_ALIGNED';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  programId: string;
  programName: string;
  /** Short action-oriented headline */
  title: string;
  /** One-sentence explanation of *why* this is recommended */
  reason: string;
  /** Optional: suggested starting level (from Level Equivalence or default) */
  suggestedLevel?: number;
  /** Confidence score 0-100 — used for sorting; not displayed to user */
  confidence: number;
  /** Optional icon hint for the UI */
  icon?: string;
  /** Optional image URL from the program */
  imageUrl?: string;
}

/**
 * Input context for the recommendation engine.
 * Assembled by the caller from onboarding data + quiz results.
 */
export interface RecommendationContext {
  /** Programs already assigned by the quiz (will NOT be recommended again) */
  assignedProgramIds: string[];
  /** The assigned levels for each program (programId → level number) */
  assignedLevels: Record<string, number>;
  /** User's stated goals (e.g., ['routine', 'skills', 'aesthetics']) */
  goals: string[];
  /** Equipment available to the user */
  equipment: {
    hasGym: boolean;
    equipmentList: string[];
    equipmentCategory?: string;
  };
  /** Training frequency (days/week) */
  trainingDaysPerWeek: number;
  /** Training history */
  trainingHistory?: string;
  /** Other sports the user participates in */
  otherSportsTags?: string[];
  /** Outdoor gym experience level */
  outdoorGymExperience?: string;
}

// ============================================================================
// STATIC RULE DEFINITIONS
// ============================================================================

/**
 * Complementary pairing map: if the user is assigned program A,
 * suggest program B as a balancing counterpart.
 */
const COMPLEMENTARY_PAIRS: Record<string, string[]> = {
  push: ['pull', 'core'],
  pull: ['push', 'core'],
  upper_body: ['lower_body', 'core'],
  lower_body: ['upper_body', 'core'],
  core: ['upper_body', 'lower_body'],
  full_body: [], // Full body already covers everything
  legs: ['upper_body', 'push', 'pull'],
  handstand: ['push', 'core'],
  planche: ['push', 'front_lever'],
  front_lever: ['pull', 'planche'],
  muscle_up: ['pull', 'push'],
};

/**
 * Goal → Program affinity map: maps user goals to programs with high relevance.
 */
const GOAL_PROGRAM_AFFINITY: Record<string, { programId: string; confidence: number }[]> = {
  routine: [
    { programId: 'full_body', confidence: 80 },
  ],
  aesthetics: [
    { programId: 'upper_body', confidence: 85 },
    { programId: 'push', confidence: 75 },
    { programId: 'core', confidence: 70 },
  ],
  fitness: [
    { programId: 'full_body', confidence: 80 },
    { programId: 'cardio', confidence: 75 },
  ],
  performance: [
    { programId: 'muscle_up', confidence: 80 },
    { programId: 'planche', confidence: 75 },
    { programId: 'front_lever', confidence: 75 },
    { programId: 'handstand', confidence: 70 },
  ],
  skills: [
    { programId: 'handstand', confidence: 90 },
    { programId: 'planche', confidence: 85 },
    { programId: 'front_lever', confidence: 85 },
    { programId: 'muscle_up', confidence: 80 },
  ],
  community: [
    { programId: 'full_body', confidence: 60 },
  ],
};

/**
 * Equipment → Program unlock map: programs that become viable
 * when the user has specific equipment.
 */
const EQUIPMENT_PROGRAM_MAP: Record<string, string[]> = {
  pull_up_bar: ['pull', 'front_lever', 'muscle_up'],
  resistance_bands: ['push', 'pull', 'upper_body'],
  dip_bars: ['push', 'planche'],
  rings: ['muscle_up', 'front_lever', 'push', 'pull'],
  parallettes: ['handstand', 'planche', 'push'],
  kettlebell: ['full_body', 'lower_body'],
  dumbbells: ['upper_body', 'lower_body'],
};

/**
 * Upgrade triggers: when an assigned level meets a threshold,
 * suggest the upgrade path.
 */
const UPGRADE_TRIGGERS: Array<{
  sourceProgramId: string;
  minLevel: number;
  suggestion: { programId: string; reason: string };
}> = [
  {
    sourceProgramId: 'full_body',
    minLevel: 8,
    suggestion: {
      programId: 'upper_body',
      reason: 'הרמה שלך ב-Full Body מאפשרת לעבור לפיצול Upper/Lower לאימון ממוקד יותר',
    },
  },
  {
    sourceProgramId: 'push',
    minLevel: 12,
    suggestion: {
      programId: 'planche',
      reason: 'רמת Push גבוהה — מומלץ להתחיל Planche Training',
    },
  },
  {
    sourceProgramId: 'pull',
    minLevel: 12,
    suggestion: {
      programId: 'front_lever',
      reason: 'רמת Pull גבוהה — מומלץ להתחיל Front Lever',
    },
  },
  {
    sourceProgramId: 'pull',
    minLevel: 10,
    suggestion: {
      programId: 'muscle_up',
      reason: 'רמת Pull מתקדמת — מומלץ לשלב Muscle Up Training',
    },
  },
];

// ============================================================================
// LEVEL EQUIVALENCE INTEGRATION
// ============================================================================

const LEVEL_EQUIVALENCE_COLLECTION = 'level_equivalence_rules';

/**
 * Fetch Level Equivalence rules that are triggered by any of the assigned programs/levels.
 * These represent programs the user has already "unlocked" through their quiz results.
 */
async function getTriggeredEquivalences(
  assignedLevels: Record<string, number>,
): Promise<LevelEquivalenceRule[]> {
  const triggeredRules: LevelEquivalenceRule[] = [];

  try {
    for (const [programId, level] of Object.entries(assignedLevels)) {
      if (level <= 0) continue;
      const q = query(
        collection(db, LEVEL_EQUIVALENCE_COLLECTION),
        where('sourceProgramId', '==', programId),
        where('sourceLevel', '<=', level),
      );
      const snapshot = await getDocs(q);
      for (const doc of snapshot.docs) {
        const rule = { id: doc.id, ...doc.data() } as LevelEquivalenceRule;
        if (rule.isEnabled !== false) {
          triggeredRules.push(rule);
        }
      }
    }
  } catch (error) {
    console.error('[RecommendationEngine] Error fetching equivalence rules:', error);
  }

  return triggeredRules;
}

// ============================================================================
// MAIN ENGINE
// ============================================================================

/**
 * Generate recommendations based on quiz results and user context.
 * Returns a sorted list (highest confidence first), deduped by programId.
 */
export async function generateRecommendations(
  context: RecommendationContext,
): Promise<Recommendation[]> {
  const rawRecommendations: Recommendation[] = [];

  // Load all programs for name/image lookup
  let allPrograms: Program[] = [];
  try {
    allPrograms = await getAllPrograms();
  } catch {
    console.error('[RecommendationEngine] Failed to load programs');
    return [];
  }

  const programLookup = new Map(allPrograms.map(p => [p.id, p]));

  // Helper to build a recommendation
  const makeRec = (
    type: RecommendationType,
    programId: string,
    title: string,
    reason: string,
    confidence: number,
    suggestedLevel?: number,
    icon?: string,
  ): Recommendation | null => {
    // Don't recommend already-assigned programs
    if (context.assignedProgramIds.includes(programId)) return null;

    const program = programLookup.get(programId);
    // Don't recommend master programs directly (they're aggregation-only)
    if (program?.isMaster) return null;

    return {
      id: `${type}_${programId}`,
      type,
      programId,
      programName: program?.name || programId.replace(/_/g, ' '),
      title,
      reason,
      suggestedLevel,
      confidence,
      icon,
      imageUrl: program?.imageUrl,
    };
  };

  // ── 1. COMPLEMENTARY ────────────────────────────────────────────────
  for (const assignedId of context.assignedProgramIds) {
    const complements = COMPLEMENTARY_PAIRS[assignedId] || [];
    for (const compId of complements) {
      const program = programLookup.get(compId);
      if (!program) continue;
      const rec = makeRec(
        'COMPLEMENTARY',
        compId,
        `הוסף ${program.name}`,
        `תוכנית ${program.name} משלימה את ${programLookup.get(assignedId)?.name || assignedId} לאימון מאוזן`,
        70,
        undefined,
        'balance',
      );
      if (rec) rawRecommendations.push(rec);
    }
  }

  // ── 2. GOAL_ALIGNED ─────────────────────────────────────────────────
  for (const goal of context.goals) {
    const affinities = GOAL_PROGRAM_AFFINITY[goal] || [];
    for (const { programId, confidence } of affinities) {
      const program = programLookup.get(programId);
      if (!program) continue;
      const goalLabel = goal === 'skills' ? 'תרגילים מתקדמים'
        : goal === 'aesthetics' ? 'גוף אסתטי'
        : goal === 'performance' ? 'ביצועים'
        : goal === 'fitness' ? 'כושר כללי'
        : goal === 'routine' ? 'שגרת אימונים'
        : goal;
      const rec = makeRec(
        'GOAL_ALIGNED',
        programId,
        `${program.name} — מתאים למטרה שלך`,
        `מומלץ עבור המטרה "${goalLabel}"`,
        confidence,
        undefined,
        'target',
      );
      if (rec) rawRecommendations.push(rec);
    }
  }

  // ── 3. EQUIPMENT ────────────────────────────────────────────────────
  const userEquipment = context.equipment.equipmentList || [];
  for (const gear of userEquipment) {
    const unlocked = EQUIPMENT_PROGRAM_MAP[gear] || [];
    for (const programId of unlocked) {
      const program = programLookup.get(programId);
      if (!program) continue;
      const rec = makeRec(
        'EQUIPMENT',
        programId,
        `${program.name} — נפתח בזכות הציוד שלך`,
        `הציוד "${gear.replace(/_/g, ' ')}" מאפשר אימוני ${program.name}`,
        55,
        undefined,
        'wrench',
      );
      if (rec) rawRecommendations.push(rec);
    }
  }

  // Gym unlocks many programs
  if (context.equipment.hasGym) {
    for (const program of allPrograms) {
      if (program.isMaster) continue;
      const rec = makeRec(
        'EQUIPMENT',
        program.id,
        `${program.name} — זמין בחדר כושר`,
        'גישה לחדר כושר מאפשרת את מגוון התוכניות המלא',
        40,
        undefined,
        'building',
      );
      if (rec) rawRecommendations.push(rec);
    }
  }

  // ── 4. UPGRADE ──────────────────────────────────────────────────────
  for (const trigger of UPGRADE_TRIGGERS) {
    const assignedLevel = context.assignedLevels[trigger.sourceProgramId];
    if (assignedLevel && assignedLevel >= trigger.minLevel) {
      const program = programLookup.get(trigger.suggestion.programId);
      if (!program) continue;
      const rec = makeRec(
        'UPGRADE',
        trigger.suggestion.programId,
        `שדרוג: ${program.name}`,
        trigger.suggestion.reason,
        85,
        undefined,
        'trending-up',
      );
      if (rec) rawRecommendations.push(rec);
    }
  }

  // ── 5. ADD_ON via Level Equivalence ─────────────────────────────────
  try {
    const triggeredRules = await getTriggeredEquivalences(context.assignedLevels);
    for (const rule of triggeredRules) {
      // Only recommend if not already assigned
      if (context.assignedProgramIds.includes(rule.targetProgramId)) continue;
      const program = programLookup.get(rule.targetProgramId);
      if (!program || program.isMaster) continue;

      const rec = makeRec(
        'ADD_ON',
        rule.targetProgramId,
        `${program.name} — כבר נפתח לך!`,
        rule.description || `הרמה שהושגה ב-${programLookup.get(rule.sourceProgramId)?.name || rule.sourceProgramId} מאפשרת כניסה ל-${program.name} ברמה ${rule.targetLevel}`,
        92, // High confidence — system-verified unlock
        rule.targetLevel,
        'unlock',
      );
      if (rec) rawRecommendations.push(rec);
    }
  } catch (error) {
    console.error('[RecommendationEngine] Level equivalence lookup failed:', error);
  }

  // ── Deduplicate & Sort ──────────────────────────────────────────────
  const seen = new Set<string>();
  const deduped: Recommendation[] = [];

  // Sort by confidence desc before dedup so higher-confidence wins
  rawRecommendations.sort((a, b) => b.confidence - a.confidence);

  for (const rec of rawRecommendations) {
    if (!seen.has(rec.programId)) {
      seen.add(rec.programId);
      deduped.push(rec);
    }
  }

  return deduped;
}

// ============================================================================
// CONVENIENCE: Build context from OnboardingData
// ============================================================================

/**
 * Build a RecommendationContext from onboarding data.
 * Call this from SummaryStep or any post-quiz screen.
 */
export function buildContextFromOnboarding(data: OnboardingData): RecommendationContext {
  const assignedProgramIds: string[] = [];
  const assignedLevels: Record<string, number> = {};

  // Extract from assignedResults (highest priority)
  if (data.assignedResults && data.assignedResults.length > 0) {
    for (const result of data.assignedResults) {
      assignedProgramIds.push(result.programId);
      // Extract numeric level from levelId (e.g., "push_lvl_3" → 3)
      const levelMatch = result.levelId.match(/(\d+)$/);
      const levelNum = levelMatch ? parseInt(levelMatch[1], 10) : 1;
      assignedLevels[result.programId] = levelNum;
    }
  } else if (data.assignedProgramId) {
    // Legacy single assignment
    assignedProgramIds.push(data.assignedProgramId);
    if (data.assignedLevel) {
      assignedLevels[data.assignedProgramId] = data.assignedLevel;
    } else if (data.assignedLevelId) {
      const levelMatch = data.assignedLevelId.match(/(\d+)$/);
      assignedLevels[data.assignedProgramId] = levelMatch ? parseInt(levelMatch[1], 10) : 1;
    }
  }

  return {
    assignedProgramIds,
    assignedLevels,
    goals: data.selectedGoals || (data.selectedGoal ? [data.selectedGoal] : []),
    equipment: {
      hasGym: data.hasGym || false,
      equipmentList: data.equipmentList || [],
      equipmentCategory: data.equipmentCategory,
    },
    trainingDaysPerWeek: data.trainingDays || 3,
    trainingHistory: data.trainingHistory || data.pastActivityLevel,
    otherSportsTags: data.otherSportsTags,
    outdoorGymExperience: data.outdoorGymExperience,
  };
}
