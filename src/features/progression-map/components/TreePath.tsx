'use client';

/**
 * TreePath — the winding, downward-scrolling path connecting a Skill Tree's
 * rungs.
 *
 * Revised per visual QA: the first pass rendered nodes as sparse floating
 * dots with no connecting structure, which read as empty/bare. This version
 * draws a CONTINUOUS central dashed spine (one line running the full height
 * of the tree) with a short branch connecting the spine to each
 * alternating-side node — a real trunk-and-branches path, not isolated dots.
 * Consecutive empty levels collapse into one compact gap pill via
 * groupRungsForDisplay (build-skill-tree.service.ts) instead of one blank
 * segment per empty level.
 *
 * Layout note: the grid-cols-2 + explicit dir="ltr" wrapper is deliberate —
 * it guarantees the column boundary sits at an exact, unambiguous 50% (the
 * spine's position) and lets each row's height stay content-driven (auto),
 * which two earlier attempts (percentage-padding on a flex row, then
 * position:absolute with a guessed fixed row height) both got wrong: the
 * first drifted off the true center, the second clipped/overlapped taller
 * "current" nodes (extra label + swap pill) against neighboring rows.
 *
 * Base/foundation at the top, target at the bottom (locked design). The
 * max-level rung is always the target (crown), regardless of whether the
 * user has reached it. Below the user's current level = done; at it =
 * current; above = locked. When currentLevel is null (never assessed for
 * this program), the tree's own minimum level is treated as "current" so
 * there's always an entry point — a reasonable default, not confirmed with
 * the founder; flag if a different empty-state is wanted.
 */
import type { ReactNode } from 'react';
import type { SkillTreeData, SkillTreeRung } from '../core/types';
import { groupRungsForDisplay } from '../services/build-skill-tree.service';
import { TreeNode, type TreeNodeState } from './TreeNode';

const BRANCH_WIDTH = 28; // px, spine → node connector

const STATE_COLOR: Record<TreeNodeState, string> = {
  done: '#20C6D6',
  current: '#2AA3E8',
  target: '#F59E0B',
  locked: '#CBD5E1',
};

function deriveState(rung: SkillTreeRung, tree: SkillTreeData, currentLevel: number | null): TreeNodeState {
  if (rung.level === tree.maxLevel) return 'target';
  const effectiveCurrent = currentLevel ?? tree.minLevel;
  if (rung.level < effectiveCurrent) return 'done';
  if (rung.level === effectiveCurrent) return 'current';
  return 'locked';
}

function GapPill({ fromLevel, toLevel }: { fromLevel: number; toLevel: number }) {
  const label = fromLevel === toLevel ? `רמה ${fromLevel}` : `רמות ${fromLevel}–${toLevel}`;
  return (
    <div className="flex items-center justify-center" style={{ height: 32 }}>
      <div className="bg-slate-100 text-slate-400 text-[11px] font-semibold rounded-full px-3 py-1" dir="rtl">
        {label} · אין תרגיל ייעודי
      </div>
    </div>
  );
}

/** Branch connector + node, packed against the grid-column edge that touches the center spine. */
function BranchAndNode({
  onRight,
  color,
  dimmed,
  children,
}: {
  onRight: boolean;
  color: string;
  dimmed: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center" style={{ flexDirection: onRight ? 'row' : 'row-reverse' }}>
      <div
        className="border-t-2 border-dashed flex-shrink-0"
        style={{ width: BRANCH_WIDTH, borderColor: color, opacity: dimmed ? 0.6 : 1 }}
      />
      {children}
    </div>
  );
}

export interface TreePathProps {
  tree: SkillTreeData;
  currentLevel: number | null;
  location: string | null;
  onNodeTap: (rung: SkillTreeRung, state: TreeNodeState) => void;
  onSwapTap: (rung: SkillTreeRung) => void;
}

export function TreePath({ tree, currentLevel, location, onNodeTap, onSwapTap }: TreePathProps) {
  const segments = groupRungsForDisplay(tree.rungs);

  return (
    <div className="relative" dir="ltr">
      {/* Continuous central spine */}
      <div className="absolute top-0 bottom-0 border-r-2 border-dashed border-[#BEE7E4]" style={{ left: '50%' }} />

      <div className="relative flex flex-col gap-3">
        {segments.map((segment, i) => {
          if (segment.type === 'gap') {
            return <GapPill key={`gap-${segment.fromLevel}`} fromLevel={segment.fromLevel} toLevel={segment.toLevel} />;
          }

          const { rung } = segment;
          const onRight = i % 2 === 0;
          const state = deriveState(rung, tree, currentLevel);
          const color = STATE_COLOR[state];

          return (
            <div key={rung.level} className="grid grid-cols-2 items-center">
              <div className="flex justify-end">
                {!onRight && (
                  <BranchAndNode onRight={false} color={color} dimmed={state === 'locked'}>
                    <TreeNode
                      exercise={rung.representative!}
                      level={rung.level}
                      state={state}
                      location={location}
                      siblingCount={rung.siblingCount}
                      align="end"
                      onTap={() => onNodeTap(rung, state)}
                      onSwapTap={rung.siblingCount > 0 ? () => onSwapTap(rung) : undefined}
                    />
                  </BranchAndNode>
                )}
              </div>
              <div className="flex justify-start">
                {onRight && (
                  <BranchAndNode onRight={true} color={color} dimmed={state === 'locked'}>
                    <TreeNode
                      exercise={rung.representative!}
                      level={rung.level}
                      state={state}
                      location={location}
                      siblingCount={rung.siblingCount}
                      align="start"
                      onTap={() => onNodeTap(rung, state)}
                      onSwapTap={rung.siblingCount > 0 ? () => onSwapTap(rung) : undefined}
                    />
                  </BranchAndNode>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
