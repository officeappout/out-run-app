/** Week-structure tunables (owner 26.10.2026). Plain constants. */
import type { Emphasis, MovementKind, SkillFamily, SkillId, WeekBand } from './types';

/** One cut for the whole system: <=5 beginner, 6-13 intermediate, 14+ advanced. */
export const BAND_CUTS = { beginnerMax: 5, intermediateMax: 13 } as const;

export const MAX_WEEK_DAYS = 7;
/** Beginners get at most this many strength days; extra chosen days become movement days. */
export const BEGINNER_STRENGTH_DAYS = 3;
/** Recommendation: with this many days or fewer, a chosen skill gets a soft "add a day" hint. */
export const SKILL_HINT_MAX_DAYS = 3;

/** Full-body emphasis rotation for 1-3 days. */
export const EMPHASIS_ROTATION: readonly Emphasis[] = ['push', 'pull', 'legs'];
/** Movement day rotation. */
export const MOVEMENT_ROTATION: readonly MovementKind[] = ['walk', 'mobility', 'core_short'];

/** Skill share of a session once the user consciously chose it (the existing 65%). */
export const SKILL_LEAD_SHARE = 0.65;
export const SKILL_MINOR_SHARE = 0.2;
/** Short session (<= SHORT_SESSION_MINUTES): skill leads a fixed block, then the rest of the body. */
export const SHORT_SESSION_MINUTES = 40;
export const SKILL_SHORT_SESSION_MINUTES = 14;

export interface SkillRule {
  family: SkillFamily;
  /** Base group whose level unlocks it. */
  group: Emphasis;
  minLevel: number;
  /** Extra prerequisite flag, besides the level. */
  needs?: 'handstand_chest_to_wall';
}

/** Unlocks by base level. one_arm_pullup 15 is the owner-delegated recommendation; handstand ~8-10; muscle_up is not in the decisions (kept at pull 10, open). */
export const SKILL_RULES: Readonly<Record<SkillId, SkillRule>> = {
  front_lever: { family: 'pull', group: 'pull', minLevel: 14 },
  planche: { family: 'push', group: 'push', minLevel: 16 },
  one_arm_pullup: { family: 'pull', group: 'pull', minLevel: 15 },
  handstand: { family: 'push', group: 'push', minLevel: 8 },
  hspu: { family: 'push', group: 'push', minLevel: 16, needs: 'handstand_chest_to_wall' },
  muscle_up: { family: 'pull', group: 'pull', minLevel: 10 },
};

/** Advanced style priority. */
export const STYLE_LITTLE_TIME_MINUTES = 30;
export const STYLE_FINISHER_ROTATION = ['emom', 'amrap'] as const;
export const STYLE_FIRST_FOR_TIME_PRESSED = ['emom', 'amrap', 'circuit'] as const;

export function bandOf(level: number): WeekBand {
  if (level <= BAND_CUTS.beginnerMax) return 'beginner';
  if (level <= BAND_CUTS.intermediateMax) return 'intermediate';
  return 'advanced';
}
