/**
 * i18n wave 2 (profile namespace): the Skill Tree components' copy moved to
 * src/messages/he/profile.json. The snapshots were recorded from the
 * components BEFORE the extraction (origin/main @ 1dd0a334); after it they
 * must render byte-identical markup in Hebrew, v1 and v2 (enable_home_v2).
 *
 * Static render only (node, no jsdom): ProgramInfoPanel renders collapsed
 * (its expanded body sits behind a click), so those keys are pinned by the
 * catalog test (src/lib/i18n/__tests__/profile-he.test.ts) instead.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Exercise } from '@/features/content/exercises';
import { ProgramInfoPanel, type ProgramInfoPanelProps } from '../ProgramInfoPanel';
import { TreePath } from '../TreePath';
import type { SkillTreeData } from '../../core/types';

const snap = (name: string) => `./__snapshots__/skill-tree-i18n/${name}.html`;
const noop = () => {};

function panel(over: Partial<ProgramInfoPanelProps> = {}): ProgramInfoPanelProps {
  return {
    programName: 'מתח',
    iconKey: 'pull',
    currentLevel: 3,
    maxLevel: 10,
    progressPercent: 42,
    programDescription: 'תיאור',
    levelDescription: 'רמה אמיתית',
    matchingGoal: { exerciseId: 'e3', targetValue: 8, unit: 'reps' },
    currentLevelExerciseName: 'תרגיל',
    hasGoals: true,
    goalsCompleted: false,
    onReassess: noop,
    ...over,
  };
}

const ex = (id: string): Exercise => ({ id, name: { he: `תרגיל ${id}`, en: id } } as unknown as Exercise);

const tree: SkillTreeData = {
  programId: 'pull_up',
  minLevel: 1,
  maxLevel: 8,
  exerciseCount: 5,
  rungs: [
    { level: 1, representative: ex('e1'), siblingCount: 0, isGap: false },
    { level: 2, representative: ex('e2'), siblingCount: 2, isGap: false },
    { level: 3, representative: ex('e3'), siblingCount: 0, isGap: false },
    { level: 4, representative: null, siblingCount: 0, isGap: true },
    { level: 5, representative: ex('e5'), siblingCount: 0, isGap: false },
    { level: 6, representative: null, siblingCount: 0, isGap: true },
    { level: 7, representative: null, siblingCount: 0, isGap: true },
    { level: 8, representative: ex('e8'), siblingCount: 1, isGap: false },
  ],
};

describe('ProgramInfoPanel — Hebrew markup unchanged', () => {
  for (const docked of [false, true]) {
    const v = docked ? 'v2' : 'v1';
    it(`${v} · mid level`, async () => {
      await expect(renderToStaticMarkup(<ProgramInfoPanel {...panel({ docked })} />)).toMatchFileSnapshot(snap(`panel-${v}-mid`));
    });
    it(`${v} · top level, no progress`, async () => {
      await expect(
        renderToStaticMarkup(<ProgramInfoPanel {...panel({ docked, currentLevel: 10, progressPercent: null })} />),
      ).toMatchFileSnapshot(snap(`panel-${v}-top`));
    });
  }
});

describe('TreePath (+ TreeNode, gap pills) — Hebrew markup unchanged', () => {
  for (const v2 of [false, true]) {
    const v = v2 ? 'v2' : 'v1';
    it(`${v} · assessed (you-are-here, target, gaps)`, async () => {
      await expect(
        renderToStaticMarkup(<TreePath tree={tree} currentLevel={3} v2={v2} onNodeTap={noop} onSwapTap={noop} />),
      ).toMatchFileSnapshot(snap(`tree-${v}-assessed`));
    });
    it(`${v} · unassessed`, async () => {
      await expect(
        renderToStaticMarkup(<TreePath tree={tree} currentLevel={null} v2={v2} onNodeTap={noop} onSwapTap={noop} />),
      ).toMatchFileSnapshot(snap(`tree-${v}-unassessed`));
    });
  }
});
