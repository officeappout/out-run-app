import { describe, it, expect } from 'vitest';
import { buildSkillTree, resolveLevelInProgram, groupRungsForDisplay } from '../build-skill-tree.service';
import type { Exercise } from '@/features/content/exercises';

const PROGRAM_A = 'programA';
const PROGRAM_B = 'programB';

function ex(id: string, targetPrograms: { programId: string; level: number }[]): Exercise {
  return {
    id,
    name: { he: id, en: id },
    targetPrograms,
  } as unknown as Exercise;
}

describe('resolveLevelInProgram', () => {
  it('resolves the level entry matching the given programId', () => {
    const e = ex('e1', [{ programId: PROGRAM_A, level: 3 }, { programId: PROGRAM_B, level: 7 }]);
    expect(resolveLevelInProgram(e, PROGRAM_A)).toBe(3);
    expect(resolveLevelInProgram(e, PROGRAM_B)).toBe(7);
  });

  it('returns null when the exercise is not tagged to that program', () => {
    const e = ex('e1', [{ programId: PROGRAM_A, level: 3 }]);
    expect(resolveLevelInProgram(e, PROGRAM_B)).toBeNull();
  });

  it('never falls back to targetPrograms[0] for a different program', () => {
    // Regression guard for the exact bug found in useExerciseMasterData.ts's
    // getExerciseLevel — must not silently return PROGRAM_A's level when asked
    // about PROGRAM_B just because PROGRAM_A happens to be index 0.
    const e = ex('e1', [{ programId: PROGRAM_A, level: 3 }]);
    expect(resolveLevelInProgram(e, PROGRAM_B)).not.toBe(3);
  });

  it('treats a non-positive or non-numeric level as unresolvable', () => {
    const e = ex('e1', [{ programId: PROGRAM_A, level: 0 }]);
    expect(resolveLevelInProgram(e, PROGRAM_A)).toBeNull();
  });
});

describe('buildSkillTree', () => {
  it('returns null when no exercise is tagged to the program', () => {
    const exercises = [ex('e1', [{ programId: PROGRAM_B, level: 1 }])];
    expect(buildSkillTree(exercises, PROGRAM_A)).toBeNull();
  });

  it('builds an ascending ladder from min to max observed level', () => {
    const exercises = [
      ex('e3', [{ programId: PROGRAM_A, level: 3 }]),
      ex('e1', [{ programId: PROGRAM_A, level: 1 }]),
      ex('e5', [{ programId: PROGRAM_A, level: 5 }]),
    ];
    const tree = buildSkillTree(exercises, PROGRAM_A)!;
    expect(tree.minLevel).toBe(1);
    expect(tree.maxLevel).toBe(5);
    expect(tree.rungs.map((r) => r.level)).toEqual([1, 2, 3, 4, 5]);
    expect(tree.exerciseCount).toBe(3);
  });

  it('renders an empty level between min and max as a gap rung, not a node', () => {
    const exercises = [
      ex('e1', [{ programId: PROGRAM_A, level: 1 }]),
      ex('e4', [{ programId: PROGRAM_A, level: 4 }]),
    ];
    const tree = buildSkillTree(exercises, PROGRAM_A)!;
    const gapRungs = tree.rungs.filter((r) => r.isGap);
    expect(gapRungs.map((r) => r.level)).toEqual([2, 3]);
    for (const r of gapRungs) {
      expect(r.representative).toBeNull();
      expect(r.siblingCount).toBe(0);
    }
  });

  it('picks the lexicographically-first doc ID as representative when a level has multiple exercises, and counts the rest as siblings', () => {
    const exercises = [
      ex('zzz', [{ programId: PROGRAM_A, level: 2 }]),
      ex('aaa', [{ programId: PROGRAM_A, level: 2 }]),
      ex('mmm', [{ programId: PROGRAM_A, level: 2 }]),
    ];
    const tree = buildSkillTree(exercises, PROGRAM_A)!;
    const rung = tree.rungs.find((r) => r.level === 2)!;
    expect(rung.representative?.id).toBe('aaa');
    expect(rung.siblingCount).toBe(2);
    expect(rung.isGap).toBe(false);
  });

  it('representative pick is deterministic and stable across repeated calls (order-independent input)', () => {
    const a = ex('b', [{ programId: PROGRAM_A, level: 1 }]);
    const b = ex('a', [{ programId: PROGRAM_A, level: 1 }]);
    const tree1 = buildSkillTree([a, b], PROGRAM_A)!;
    const tree2 = buildSkillTree([b, a], PROGRAM_A)!;
    expect(tree1.rungs[0].representative?.id).toBe('a');
    expect(tree2.rungs[0].representative?.id).toBe('a');
  });

  it('ignores an exercise entirely when its level for this program is unresolvable, without breaking the rest of the tree', () => {
    const exercises = [
      ex('e1', [{ programId: PROGRAM_A, level: 1 }]),
      ex('bad', [{ programId: PROGRAM_A, level: NaN }]),
      ex('e2', [{ programId: PROGRAM_A, level: 2 }]),
    ];
    const tree = buildSkillTree(exercises, PROGRAM_A)!;
    expect(tree.minLevel).toBe(1);
    expect(tree.maxLevel).toBe(2);
    expect(tree.exerciseCount).toBe(2);
  });

  it('only counts an exercise toward the program it is actually tagged to at the resolved level (cross-tagging is handled per-program independently)', () => {
    const shared = ex('shared', [
      { programId: PROGRAM_A, level: 1 },
      { programId: PROGRAM_B, level: 9 },
    ]);
    const treeA = buildSkillTree([shared], PROGRAM_A)!;
    const treeB = buildSkillTree([shared], PROGRAM_B)!;
    expect(treeA.rungs[0].level).toBe(1);
    expect(treeB.rungs[0].level).toBe(9);
  });

  describe('beginner-appropriate representative pick (round 10, un-gated in round 11)', () => {
    const ONE_ARM_PULLUP = PROGRAM_A;
    // Round 11: the proxy no longer requires the OTHER program to be
    // "composite"/isMaster — ANY other targetPrograms entry counts, because
    // gating on isMaster silently no-opped against real Firestore data
    // (משיכה isn't reliably flagged isMaster=true in production). "PULL" is
    // just an ordinary other-program id here, same as any leaf program's id
    // would be — the function makes no isMaster distinction anymore.
    const PULL = 'pull';

    it('the concrete example: picks the candidate with the LOWER level in the other program (Pull) as representative', () => {
      // "מתח שכמות קשתים" — one-arm-pullup L1, Pull L11 (harder)
      const scapularArch = ex('scapularArch', [
        { programId: ONE_ARM_PULLUP, level: 1 },
        { programId: PULL, level: 11 },
      ]);
      // "מתח בתפיסה הפוכה/סופינציה" — one-arm-pullup L1, Pull L10 (easier — should win)
      const supinatedPullup = ex('supinatedPullup', [
        { programId: ONE_ARM_PULLUP, level: 1 },
        { programId: PULL, level: 10 },
      ]);
      const tree = buildSkillTree([scapularArch, supinatedPullup], ONE_ARM_PULLUP)!;
      const rung = tree.rungs.find((r) => r.level === 1)!;
      expect(rung.representative?.id).toBe('supinatedPullup');
    });

    it('a candidate with no other targetPrograms entry at all loses to one that has a real proxy, regardless of doc ID', () => {
      const noProxy = ex('aaa_no_proxy', [{ programId: ONE_ARM_PULLUP, level: 1 }]); // no other program tag
      const withProxy = ex('zzz_has_proxy', [
        { programId: ONE_ARM_PULLUP, level: 1 },
        { programId: PULL, level: 5 },
      ]);
      const tree = buildSkillTree([noProxy, withProxy], ONE_ARM_PULLUP)!;
      const rung = tree.rungs.find((r) => r.level === 1)!;
      expect(rung.representative?.id).toBe('zzz_has_proxy');
    });

    it('when neither candidate has any other targetPrograms entry, falls back to doc ID (both proxies are Infinity)', () => {
      const a = ex('zzz', [{ programId: ONE_ARM_PULLUP, level: 1 }]);
      const b = ex('aaa', [{ programId: ONE_ARM_PULLUP, level: 1 }]);
      const tree = buildSkillTree([a, b], ONE_ARM_PULLUP)!;
      const rung = tree.rungs.find((r) => r.level === 1)!;
      expect(rung.representative?.id).toBe('aaa');
    });

    it('ignores a targetPrograms entry pointing at the SAME leaf program being built (not a valid "other" proxy)', () => {
      // Only one candidate has a real Pull tag; the other's "self" entry must not be mistaken for a proxy.
      const selfOnly = ex('selfOnly', [{ programId: ONE_ARM_PULLUP, level: 1 }]);
      const realProxy = ex('realProxy', [
        { programId: ONE_ARM_PULLUP, level: 1 },
        { programId: PULL, level: 3 },
      ]);
      const tree = buildSkillTree([selfOnly, realProxy], ONE_ARM_PULLUP)!;
      const rung = tree.rungs.find((r) => r.level === 1)!;
      expect(rung.representative?.id).toBe('realProxy');
    });

    it('a candidate cross-tagged to ANY other program counts, even an unrelated leaf program (no isMaster distinction anymore)', () => {
      const UNRELATED_LEAF = 'someOtherLeafProgram';
      const crossTaggedToUnrelatedLeaf = ex('crossTagged', [
        { programId: ONE_ARM_PULLUP, level: 1 },
        { programId: UNRELATED_LEAF, level: 2 }, // low level — a real signal now, unlike round 10
      ]);
      const higherProxy = ex('higherProxy', [
        { programId: ONE_ARM_PULLUP, level: 1 },
        { programId: PULL, level: 20 },
      ]);
      const tree = buildSkillTree([crossTaggedToUnrelatedLeaf, higherProxy], ONE_ARM_PULLUP)!;
      const rung = tree.rungs.find((r) => r.level === 1)!;
      // crossTagged wins now — its proxy (2) is lower than higherProxy's (20),
      // and round 11 deliberately treats them the same regardless of which
      // program each points to.
      expect(rung.representative?.id).toBe('crossTagged');
    });

    it('a candidate tagged to MULTIPLE other programs uses the LOWEST level among them', () => {
      const multiTagged = ex('multiTagged', [
        { programId: ONE_ARM_PULLUP, level: 1 },
        { programId: PULL, level: 15 },
        { programId: 'someOtherProgram', level: 4 }, // lower — this one should win as the proxy
      ]);
      const singleTagged = ex('singleTagged', [
        { programId: ONE_ARM_PULLUP, level: 1 },
        { programId: PULL, level: 6 },
      ]);
      const tree = buildSkillTree([multiTagged, singleTagged], ONE_ARM_PULLUP)!;
      const rung = tree.rungs.find((r) => r.level === 1)!;
      // multiTagged's effective proxy is min(15, 4) = 4, beating singleTagged's 6.
      expect(rung.representative?.id).toBe('multiTagged');
    });
  });
});

describe('groupRungsForDisplay', () => {
  it('passes through consecutive real nodes unchanged', () => {
    const exercises = [ex('e1', [{ programId: PROGRAM_A, level: 1 }]), ex('e2', [{ programId: PROGRAM_A, level: 2 }])];
    const tree = buildSkillTree(exercises, PROGRAM_A)!;
    const segments = groupRungsForDisplay(tree.rungs);
    expect(segments).toEqual([
      { type: 'node', rung: tree.rungs[0] },
      { type: 'node', rung: tree.rungs[1] },
    ]);
  });

  it('collapses a run of consecutive gaps into one segment spanning the range', () => {
    const exercises = [ex('e1', [{ programId: PROGRAM_A, level: 1 }]), ex('e5', [{ programId: PROGRAM_A, level: 5 }])];
    const tree = buildSkillTree(exercises, PROGRAM_A)!;
    const segments = groupRungsForDisplay(tree.rungs);
    expect(segments).toEqual([
      { type: 'node', rung: tree.rungs[0] },
      { type: 'gap', fromLevel: 2, toLevel: 4 },
      { type: 'node', rung: tree.rungs[4] },
    ]);
  });

  it('a single-level gap still produces a gap segment with fromLevel === toLevel', () => {
    const exercises = [ex('e1', [{ programId: PROGRAM_A, level: 1 }]), ex('e3', [{ programId: PROGRAM_A, level: 3 }])];
    const tree = buildSkillTree(exercises, PROGRAM_A)!;
    const segments = groupRungsForDisplay(tree.rungs);
    expect(segments[1]).toEqual({ type: 'gap', fromLevel: 2, toLevel: 2 });
  });

  it('does not merge two gap runs separated by a real node', () => {
    const exercises = [ex('e1', [{ programId: PROGRAM_A, level: 1 }]), ex('e4', [{ programId: PROGRAM_A, level: 4 }]), ex('e6', [{ programId: PROGRAM_A, level: 6 }])];
    const tree = buildSkillTree(exercises, PROGRAM_A)!;
    const segments = groupRungsForDisplay(tree.rungs);
    const gapSegments = segments.filter((s) => s.type === 'gap');
    expect(gapSegments).toHaveLength(2);
    expect(gapSegments[0]).toEqual({ type: 'gap', fromLevel: 2, toLevel: 3 });
    expect(gapSegments[1]).toEqual({ type: 'gap', fromLevel: 5, toLevel: 5 });
  });
});
