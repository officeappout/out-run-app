'use client';

/**
 * TreePath — the winding, downward-scrolling path connecting a Skill Tree's
 * rungs. No existing precedent for this layout was found anywhere in the
 * codebase — genuinely new UI.
 *
 * Base/foundation at the top, target at the bottom (locked design). Nodes
 * alternate left/right; a dotted connector runs between them (brand-colored
 * once "done" progress reaches it, grey otherwise). Empty levels between the
 * tree's min and max render as a short connector-only gap segment, not a node.
 *
 * State derivation (4 states per the locked design): the max-level rung is
 * always the target (crown), regardless of whether the user has reached it.
 * Below the user's current level = done; at it = current; above = locked.
 * When currentLevel is null (never assessed for this program), the tree's
 * own minimum level is treated as "current" so there's always an entry point
 * — a reasonable default, not confirmed with the founder; flag if a
 * different empty-state is wanted.
 */
import type { SkillTreeData, SkillTreeRung } from '../core/types';
import { TreeNode, type TreeNodeState } from './TreeNode';

function deriveState(rung: SkillTreeRung, tree: SkillTreeData, currentLevel: number | null): TreeNodeState {
  if (rung.level === tree.maxLevel) return 'target';
  const effectiveCurrent = currentLevel ?? tree.minLevel;
  if (rung.level < effectiveCurrent) return 'done';
  if (rung.level === effectiveCurrent) return 'current';
  return 'locked';
}

export interface TreePathProps {
  tree: SkillTreeData;
  currentLevel: number | null;
  location: string | null;
  onNodeTap: (rung: SkillTreeRung) => void;
  onSwapTap: (rung: SkillTreeRung) => void;
}

export function TreePath({ tree, currentLevel, location, onNodeTap, onSwapTap }: TreePathProps) {
  return (
    <div className="relative flex flex-col items-center gap-8 py-6">
      {tree.rungs.map((rung, i) => {
        const align: 'start' | 'end' = i % 2 === 0 ? 'start' : 'end';
        const isDoneConnector = currentLevel != null && rung.level < currentLevel;

        if (rung.isGap) {
          return (
            <div key={rung.level} className="flex items-center justify-center h-8">
              <div
                className="w-0.5 h-8 border-r-2 border-dashed"
                style={{ borderColor: isDoneConnector ? '#20C6D6' : '#CBD5E1' }}
              />
            </div>
          );
        }

        const state = deriveState(rung, tree, currentLevel);

        return (
          <div key={rung.level} className={`w-full flex ${align === 'start' ? 'justify-start pl-6' : 'justify-end pr-6'}`}>
            <TreeNode
              exercise={rung.representative!}
              level={rung.level}
              state={state}
              location={location}
              siblingCount={rung.siblingCount}
              align={align}
              onTap={() => onNodeTap(rung)}
              onSwapTap={rung.siblingCount > 0 ? () => onSwapTap(rung) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
