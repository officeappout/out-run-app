import type { Exercise } from '@/features/content/exercises';

/** One rung of a Skill Tree ladder — either a real level or an empty gap. */
export interface SkillTreeRung {
  level: number;
  /** The one exercise shown on the spine for this level. Null only when isGap. */
  representative: Exercise | null;
  /**
   * Count of OTHER exercises tagged to this program at this exact level
   * (i.e. excluding the representative) — feeds the 🔄 swap pill's "+N".
   * 0 when there are no siblings; the pill should not render in that case.
   */
  siblingCount: number;
  /** True when no exercise exists at this level within the tree's range — renders as a gap/transition segment, not a node. */
  isGap: boolean;
}

export interface SkillTreeData {
  programId: string;
  /** Ascending by level, lowest present to highest present. Includes gap rungs. */
  rungs: SkillTreeRung[];
  minLevel: number;
  maxLevel: number;
  /** Total distinct exercises tagged to this program (across all levels). */
  exerciseCount: number;
}

/**
 * A display-ready segment of the tree path: either one real node, or a
 * compact pill spanning a run of consecutive empty levels (rendered as
 * "רמות X–Y · אין תרגיל ייעודי", not one blank segment per empty level).
 */
export type DisplaySegment =
  | { type: 'node'; rung: SkillTreeRung }
  | { type: 'gap'; fromLevel: number; toLevel: number };
