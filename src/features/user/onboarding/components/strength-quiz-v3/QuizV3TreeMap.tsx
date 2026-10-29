'use client';

/** The progress tab's own map (TreePath, home v2 look), in a window scrolled to the user's level. Read-only. */
import { useEffect, useMemo, useRef } from 'react';
import { TreePath } from '@/features/progression-map/components/TreePath';
import { groupRungsForDisplay } from '@/features/progression-map/services/build-skill-tree.service';
import { buildTreePathLayout } from '@/features/progression-map/services/tree-path-layout';
import type { SkillTreeData } from '@/features/progression-map/core/types';
import { TREE_WINDOW_PX, currentRungLevel, treeScrollTop } from './tree-window';

const NOOP = () => {};

export default function QuizV3TreeMap({ tree, level, label }: { tree: SkillTreeData; level: number; label: string }) {
  const boxRef = useRef<HTMLElement>(null);
  const current = useMemo(
    () => currentRungLevel(tree.rungs.filter((r) => !r.isGap).map((r) => r.level), level),
    [tree, level],
  );
  useEffect(() => {
    if (!boxRef.current || current == null) return;
    boxRef.current.scrollTop = treeScrollTop(buildTreePathLayout(groupRungsForDisplay(tree.rungs)).entries, current);
  }, [tree, current]);
  return (
    <section
      ref={boxRef}
      className="relative overflow-y-auto overscroll-contain rounded-[28px] bg-white shadow-v2-card"
      style={{ height: TREE_WINDOW_PX }}
      aria-label={label}
      data-quiz-v3-tree
    >
      <TreePath tree={tree} currentLevel={current} onNodeTap={NOOP} onSwapTap={NOOP} v2 />
    </section>
  );
}
