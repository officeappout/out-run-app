/**
 * Level Stages — Hebrew level names for the 10-level XP progression system.
 *
 * SCOPE: This file provides Hebrew gendered level titles ONLY.
 * The admin panel (/admin/levels → Firestore `levels` collection) is the SOURCE OF TRUTH
 * for minXP thresholds and exercise target goals. The `useLevelConfig` hook reads
 * from Firestore first and uses GLOBAL_LEVEL_THRESHOLDS (xp-rules.ts) as a fallback.
 *
 * DO NOT use the minXP values here for business logic — use useLevelConfig instead.
 * These minXP values are kept in sync with GLOBAL_LEVEL_THRESHOLDS as a convenience
 * for co-location and to satisfy TypeScript without a runtime Firestore fetch.
 *
 * Gendered variants are driven by profile.core.gender at render time.
 */

export interface LevelStage {
  level: number;
  nameMale: string;
  nameFemale: string;
  minXP: number;
}

export const LEVEL_STAGES: readonly LevelStage[] = [
  { level: 1,  nameMale: 'המטפס',       nameFemale: 'המטפסת',      minXP: 0 },
  { level: 2,  nameMale: 'הסטודנט',     nameFemale: 'הסטודנטית',   minXP: 300 },
  { level: 3,  nameMale: 'הנתלה',       nameFemale: 'הנתלית',      minXP: 800 },
  { level: 4,  nameMale: 'ההרפתקן',     nameFemale: 'ההרפתקנית',   minXP: 2_000 },
  { level: 5,  nameMale: 'המקפץ',       nameFemale: 'המקפצת',      minXP: 5_000 },
  { level: 6,  nameMale: 'הדוחף',       nameFemale: 'הדוחפת',      minXP: 11_000 },
  { level: 7,  nameMale: 'הפרופסור',    nameFemale: 'הפרופסורית',  minXP: 22_000 },
  { level: 8,  nameMale: 'המאמן',       nameFemale: 'המאמנת',      minXP: 40_000 },
  { level: 9,  nameMale: 'מלך הפארק',  nameFemale: 'מלכת הפארק', minXP: 65_000 },
  { level: 10, nameMale: 'המעופף',      nameFemale: 'המעופפת',     minXP: 100_000 },
] as const;

export function getLevelStage(level: number): LevelStage {
  return LEVEL_STAGES.find(s => s.level === level) ?? LEVEL_STAGES[0];
}

export function getLevelName(level: number, gender: 'male' | 'female' | 'other'): string {
  const stage = getLevelStage(level);
  return gender === 'female' ? stage.nameFemale : stage.nameMale;
}

/**
 * Calculate progress (0-100%) between the current level's minXP and the next level's minXP.
 * Returns 100 at max level (10).
 */
export function calculateLevelProgress(globalXP: number, globalLevel: number): number {
  const current = LEVEL_STAGES.find(s => s.level === globalLevel);
  const next = LEVEL_STAGES.find(s => s.level === globalLevel + 1);
  if (!current || !next) return globalLevel >= 10 ? 100 : 0;
  const range = next.minXP - current.minXP;
  if (range <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round(((globalXP - current.minXP) / range) * 100)));
}
