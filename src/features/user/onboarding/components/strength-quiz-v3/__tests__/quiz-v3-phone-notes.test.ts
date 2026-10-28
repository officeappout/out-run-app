/** Owner phone test 28.10 (Y1 to Y11): the pure helpers behind the fixes. */
import { describe, expect, it } from 'vitest';
import { nudgeKeyframes, NUDGE_PX } from '../swipe-nudge';
import { revealEnd, splitWords, WORD_DURATION_S, WORD_STAGGER_S } from '../reveal-timing';
import { FINAL_RING_STAGE, ringFrame } from '../ring-sequence';
import { currentRungLevel, treeScrollTop, TREE_WINDOW_PX } from '../tree-window';
import { cardEnterDelays, skillSummaryRows } from '../quiz-v3-summary';
import { summaryPhaseFill } from '../quiz-v3-outro';
import type { TreePathLayoutEntry } from '@/features/progression-map/services/tree-path-layout';

describe('Y2 swipe nudge', () => {
  it('leans toward the reading start (harder card comes in)', () => {
    expect(nudgeKeyframes(true)).toEqual([0, NUDGE_PX, 0, NUDGE_PX, 0]);
    expect(nudgeKeyframes(false)).toEqual([0, -NUDGE_PX, 0, -NUDGE_PX, 0]);
  });
});

describe('Y4 word reveal timing', () => {
  it('chains the next block after the last word', () => {
    expect(splitWords('  שלום   עולם ')).toEqual(['שלום', 'עולם']);
    expect(revealEnd('a b c', 1)).toBeCloseTo(1 + 2 * WORD_STAGGER_S + WORD_DURATION_S);
    expect(revealEnd('', 0.5)).toBe(0.5);
  });
});

describe('Y8 ring sequence', () => {
  it('lights one ring after another, then levels up', () => {
    expect(ringFrame(0)).toEqual({ percents: [0, 0], lit: [false, false, false], lastPercent: 0, levelUp: false });
    expect(ringFrame(1).lit).toEqual([true, false, false]);
    expect(ringFrame(2).percents).toEqual([5, 60]);
    expect(ringFrame(3)).toMatchObject({ lastPercent: 100, levelUp: false });
    expect(ringFrame(FINAL_RING_STAGE).levelUp).toBe(true);
  });
});

describe('Y7 tree window', () => {
  it('the rung at or below the level', () => {
    expect(currentRungLevel([1, 2, 4, 6], 5)).toBe(4);
    expect(currentRungLevel([3, 4], 1)).toBe(3);
    expect(currentRungLevel([], 3)).toBeNull();
  });
  it('centres the node, clamped at the top', () => {
    const node = (level: number, y: number) =>
      ({ segment: { type: 'node', rung: { level, representative: null, siblingCount: 0, isGap: false } }, x: 30, y }) as TreePathLayoutEntry;
    const entries = [node(1, 60), node(2, 500)];
    expect(treeScrollTop(entries, 2)).toBe(500 - TREE_WINDOW_PX / 2);
    expect(treeScrollTop(entries, 1)).toBe(0);
    expect(treeScrollTop(entries, 9)).toBe(0);
  });
});

describe('Y10 / Y11 plan screen', () => {
  it('skills from the assessment and the skills screen, chosen wins, groups left out', () => {
    expect(skillSummaryRows({ push: 6, planche: 4, handstand: 0 }, [{ skillId: 'front_lever', level: 3 }, { skillId: 'planche', level: 5 }]))
      .toEqual([{ skillId: 'planche', level: 5 }, { skillId: 'front_lever', level: 3 }]);
    expect(skillSummaryRows({ push: 6, pull: 4 })).toEqual([]);
  });
  it('each card in turn, the parent last', () => {
    const d = cardEnterDelays(3);
    expect(d.children).toHaveLength(3);
    expect(d.children[1]).toBeGreaterThan(d.children[0]);
    expect(d.master).toBeGreaterThan(d.children[2]);
  });
});

describe('Y6 summary phase fill', () => {
  it('fills through the explainers', () => {
    expect(summaryPhaseFill({ kind: 'done' })).toBe(20);
    expect(summaryPhaseFill({ kind: 'explain', index: 1 })).toBe(40);
    expect(summaryPhaseFill({ kind: 'explain', index: 3 })).toBe(80);
  });
});
