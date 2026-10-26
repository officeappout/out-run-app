import { describe, expect, it } from 'vitest';
import {
  explainGroup,
  firstOutroScreen,
  ladderWindow,
  nextOutroScreen,
  prevOutroScreen,
  skipExplainers,
  weekPreview,
  type OutroScreen,
} from '../quiz-v3-outro';

describe('outro screen order', () => {
  it('skills screen only when something unlocked', () => {
    expect(firstOutroScreen(true)).toEqual({ kind: 'skills' });
    expect(firstOutroScreen(false)).toEqual({ kind: 'done' });
  });

  it('forward: skills → done → explain 1, 2, 3 → out', () => {
    const seen: OutroScreen[] = [];
    let s: OutroScreen | null = { kind: 'skills' };
    while (s) { seen.push(s); s = nextOutroScreen(s); }
    expect(seen.map((x) => (x.kind === 'explain' ? `e${x.index}` : x.kind))).toEqual(['skills', 'done', 'e1', 'e2', 'e3']);
    expect(nextOutroScreen({ kind: 'skillSlider', skillId: 'planche' })).toEqual({ kind: 'done' });
  });

  it('back', () => {
    expect(prevOutroScreen({ kind: 'skills' }, true)).toBeNull();
    expect(prevOutroScreen({ kind: 'skillSlider', skillId: 'front_lever' }, true)).toEqual({ kind: 'skills' });
    expect(prevOutroScreen({ kind: 'done' }, true)).toEqual({ kind: 'skills' });
    expect(prevOutroScreen({ kind: 'done' }, false)).toBeNull();
    expect(prevOutroScreen({ kind: 'explain', index: 1 }, false)).toEqual({ kind: 'done' });
    expect(prevOutroScreen({ kind: 'explain', index: 3 }, false)).toEqual({ kind: 'explain', index: 2 });
  });

  it('skip jumps to the last explainer', () => {
    expect(skipExplainers()).toEqual({ kind: 'explain', index: 3 });
  });
});

describe('explainer 1 data', () => {
  it('weakest group, ties go to the first in order', () => {
    expect(explainGroup({ push: 6, pull: 4, legs: 8, core: 4 })).toEqual({ group: 'pull', level: 4 });
    expect(explainGroup({ push: 6, pull: 6, legs: 6, core: 6 })).toEqual({ group: 'push', level: 6 });
    expect(explainGroup({ push: 0, legs: 3 })).toEqual({ group: 'legs', level: 3 });
    expect(explainGroup({})).toBeNull();
  });

  it('5 nodes: locked, next, current, two done (top first), gaps skipped', () => {
    expect(ladderWindow([1, 2, 4, 5, 6, 7, 9, 10], 6)).toEqual([
      { level: 9, state: 'locked' },
      { level: 7, state: 'next' },
      { level: 6, state: 'current' },
      { level: 5, state: 'done' },
      { level: 4, state: 'done' },
    ]);
  });

  it('fewer nodes at the ends of the ladder', () => {
    expect(ladderWindow([1, 2, 3], 1).map((n) => n.state)).toEqual(['locked', 'next', 'current']);
    expect(ladderWindow([1, 2, 3], 3).map((n) => n.state)).toEqual(['current', 'done', 'done']);
  });
});

describe('explainer 3 week preview', () => {
  it('three training days (Sun, Tue, Thu) with the user groups in order', () => {
    expect(weekPreview({ push: 6, pull: 4, legs: 8, core: 6 }).map((d) => d.group)).toEqual(['push', null, 'pull', null, 'legs', null, null]);
  });
  it('wraps when there are fewer groups, empty without any', () => {
    expect(weekPreview({ legs: 3 }).map((d) => d.group)).toEqual(['legs', null, 'legs', null, 'legs', null, null]);
    expect(weekPreview({}).every((d) => d.group === null)).toBe(true);
  });
});
