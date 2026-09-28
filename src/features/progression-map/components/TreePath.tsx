'use client';

/**
 * TreePath — the winding, downward-scrolling path connecting a Skill Tree's
 * rungs.
 *
 * Gentle-slalom redesign (this round): the previous version drew a
 * continuous STRAIGHT central spine (a CSS border) plus a small curved SVG
 * "branch" connecting the spine to each alternating-side node — a straight
 * line with curved stubs, not itself a winding path. This version replaces
 * both with ONE continuous SVG curve running the full height of the tree,
 * built by fitting a Catmull-Rom spline (converted to chained cubic
 * Beziers — see tree-path-layout.ts) through every node's (and gap's)
 * point — a real gentle S-curve, same thin dashed turquoise (#20C6D6)
 * stroke throughout; nothing about its thickness/color/dash style changed
 * from what was already agreed, only its shape.
 *
 * This also means the layout itself moved from natural document flow
 * (grid-cols-2 rows, content-driven height) to fixed-height absolute
 * positioning: node x/y no longer come from CSS layout at all, they come
 * from buildTreePathLayout (tree-path-layout.ts), which reserves ONE fixed
 * height per node row (RUNG_ROW_HEIGHT — denser than the old auto-height
 * rows, so more levels fit on screen) regardless of that node's own state
 * (current/target nodes are taller — bigger photo, a floating "אתה כאן"
 * bubble, a swap pill — but the row height is sized for the TALLEST
 * variant so nothing clips into a neighbor, whichever node lands there).
 * Positions are computed from the segment list generically, so this works
 * unchanged for any program length, not just the shapes tested by hand.
 *
 * Node x sits at a fixed LEFT_X/RIGHT_X percent of the container's width
 * (not the container's edges) — a comfortable, constant margin on both
 * sides regardless of viewport size, so the card + its name never clip.
 *
 * Base/foundation at the top, target at the bottom (locked design, still
 * unchanged). The max-level rung is always the target (crown), regardless
 * of whether the user has reached it. Below the user's current level =
 * done; at it = current; above = locked. When currentLevel is null (never
 * assessed for this program), the tree's own minimum level is treated as
 * "current" so there's always an entry point.
 *
 * dir="ltr" on the root is deliberate (unchanged from before) — it keeps
 * "left/right" in this file's math unambiguous regardless of the app's own
 * RTL context; the curve's SVG coordinates and the nodes' `left: {x}%`
 * positions are all physical-left/right, not logical/RTL-relative.
 */
import { groupRungsForDisplay } from '../services/build-skill-tree.service';
import { buildTreePathLayout, DEFAULT_TREE_PATH_LAYOUT_CONFIG } from '../services/tree-path-layout';
import { TreeNode, type TreeNodeState } from './TreeNode';
import type { SkillTreeData, SkillTreeRung } from '../core/types';

const PATH_COLOR = '#20C6D6';
const PATH_STROKE_WIDTH = 2;
const PATH_DASH = '6 6';

function deriveState(rung: SkillTreeRung, tree: SkillTreeData, currentLevel: number | null): TreeNodeState {
  if (rung.level === tree.maxLevel) return 'target';
  const effectiveCurrent = currentLevel ?? tree.minLevel;
  if (rung.level < effectiveCurrent) return 'done';
  if (rung.level === effectiveCurrent) return 'current';
  return 'locked';
}

/**
 * Whether the user hasn't actually reached this rung's level yet —
 * independent of the VISUAL state label from deriveState(). deriveState
 * collapses the max level to 'target' unconditionally (gold crown, even
 * before the user has reached it), which is correct for the ring/crown
 * styling but means `state === 'locked'` alone can't answer "should the
 * detail sheet show the above-your-level notice" — that check was missing
 * the target node entirely (tapping it opened the sheet with no notice,
 * same as an already-earned node). This is the one place that check
 * lives; callers should use this, not re-derive it from `state`.
 */
function isAboveCurrentLevel(rung: SkillTreeRung, tree: SkillTreeData, currentLevel: number | null): boolean {
  const effectiveCurrent = currentLevel ?? tree.minLevel;
  return rung.level > effectiveCurrent;
}

function GapPill({ fromLevel, toLevel }: { fromLevel: number; toLevel: number }) {
  const label = fromLevel === toLevel ? `רמה ${fromLevel}` : `רמות ${fromLevel}–${toLevel}`;
  return (
    <div
      className="bg-slate-100 text-slate-400 text-[11px] font-semibold rounded-full px-3 py-1 whitespace-nowrap"
      dir="rtl"
    >
      {label} · אין תרגיל ייעודי
    </div>
  );
}

export interface TreePathProps {
  tree: SkillTreeData;
  currentLevel: number | null;
  onNodeTap: (rung: SkillTreeRung, state: TreeNodeState, isAboveCurrentLevel: boolean) => void;
  onSwapTap: (rung: SkillTreeRung) => void;
}

export function TreePath({ tree, currentLevel, onNodeTap, onSwapTap }: TreePathProps) {
  const segments = groupRungsForDisplay(tree.rungs);
  const layout = buildTreePathLayout(segments);
  const config = DEFAULT_TREE_PATH_LAYOUT_CONFIG;

  return (
    <div className="relative" dir="ltr" style={{ height: layout.totalHeight }}>
      {/* Single continuous winding curve — see file header. viewBox x is in
          PERCENT (0-100, matching node `left: {x}%`) while y is in real px
          (1:1 with the container's height) — preserveAspectRatio="none"
          lets the two axes scale independently so that mixed-unit mapping
          holds at any viewport width. vector-effect keeps the stroke a
          true, undistorted 2px regardless of that non-uniform scaling. */}
      <svg
        width="100%"
        height={layout.totalHeight}
        viewBox={`0 0 100 ${layout.totalHeight}`}
        preserveAspectRatio="none"
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <path
          d={layout.pathD}
          fill="none"
          stroke={PATH_COLOR}
          strokeWidth={PATH_STROKE_WIDTH}
          strokeDasharray={PATH_DASH}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {layout.entries.map((entry) => {
        if (entry.segment.type === 'gap') {
          const { fromLevel, toLevel } = entry.segment;
          return (
            <div
              key={`gap-${fromLevel}`}
              className="absolute"
              style={{ left: `${entry.x}%`, top: entry.y, transform: 'translate(-50%, -50%)' }}
            >
              <GapPill fromLevel={fromLevel} toLevel={toLevel} />
            </div>
          );
        }

        const { rung } = entry.segment;
        const state = deriveState(rung, tree, currentLevel);
        const align = entry.x === config.rightX ? 'start' : 'end';

        return (
          <div
            key={rung.level}
            className="absolute"
            style={{ left: `${entry.x}%`, top: entry.y, transform: 'translate(-50%, -50%)' }}
          >
            <TreeNode
              exercise={rung.representative!}
              level={rung.level}
              state={state}
              siblingCount={rung.siblingCount}
              align={align}
              onTap={() => onNodeTap(rung, state, isAboveCurrentLevel(rung, tree, currentLevel))}
              onSwapTap={rung.siblingCount > 0 ? () => onSwapTap(rung) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
