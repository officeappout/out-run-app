/**
 * tree-node-state.service.ts — Progression System v2, Phase 4a-fix.
 *
 * deriveState extracted OUT of TreePath.tsx specifically so it's unit-
 * testable: TreePath.tsx is a .tsx file containing JSX, which fails to
 * parse under this repo's node-only vitest config (confirmed empirically —
 * same class of issue as progression.service.ts's own barrel-import
 * problem in earlier phases). A plain .ts file with no JSX has no such
 * problem. Same "extract for testability" convention as
 * build-skill-tree.service.ts / target-program-fanout.service.ts /
 * program-card-state.service.ts.
 */
import type { SkillTreeData, SkillTreeRung } from '../core/types';
import type { TreeNodeState } from '../components/TreeNode';

/**
 * Base/foundation at the top, target at the bottom. The max-level rung is
 * always 'target' (crown), regardless of whether the user has reached it.
 * Below the user's current level = 'done'; at it = 'current'; above =
 * 'locked'.
 *
 * When currentLevel is null (never assessed for this program), the tree's
 * own minimum level still anchors the done/locked ladder shape (so there's
 * always a coherent-looking tree) — but NO rung earns 'current' (Progression
 * v2 Phase 4a-fix): an unassessed user gets no "אתה כאן" marker at all;
 * assessment is a prompt, not a proven fact about where they are. The rung
 * that WOULD have been 'current' falls back to 'locked' instead.
 */
export function deriveState(rung: SkillTreeRung, tree: SkillTreeData, currentLevel: number | null): TreeNodeState {
  if (rung.level === tree.maxLevel) return 'target';
  const effectiveCurrent = currentLevel ?? tree.minLevel;
  if (rung.level < effectiveCurrent) return 'done';
  if (rung.level === effectiveCurrent) {
    return currentLevel === null ? 'locked' : 'current';
  }
  return 'locked';
}
