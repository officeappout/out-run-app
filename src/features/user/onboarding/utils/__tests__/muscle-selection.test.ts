import { describe, it, expect } from 'vitest';
import {
  FULL_BODY_ID,
  toggleMuscleSelection,
  toPersistedMuscleFocus,
  toggleAreaTile,
  areaTilesToMuscles,
  recommendedAreaTiles,
  type AreaTileId,
} from '../muscle-selection';
import { deriveMuscleBalanceCase, recommendedMusclesForCase } from '../muscle-balance';
import { MUSCLE_FOCUS_IDS, MUSCLE_PACKAGES, type MusclePackageKey } from '../../constants/program-path.constants';

/**
 * The legacy screen's package "select all" (program-path/page.tsx
 * selectPackage): toggleMuscle for every muscle of the package not already
 * selected, in the package's declared order.
 */
function legacySelectPackage(prev: string[], key: MusclePackageKey): string[] {
  const pkg = MUSCLE_PACKAGES.find((p) => p.key === key)!;
  let next = prev;
  for (const m of pkg.muscles) {
    if (!prev.includes(m)) next = toggleMuscleSelection(next, m);
  }
  return next;
}

function legacyTapPackages(keys: MusclePackageKey[]): string[] {
  return keys.reduce<string[]>((acc, k) => legacySelectPackage(acc, k), []);
}

const persistTiles = (tiles: AreaTileId[]) => toPersistedMuscleFocus(areaTilesToMuscles(tiles));

describe('legacy reducer (moved verbatim)', () => {
  it('full body on → tag + every muscle; off → empty', () => {
    const on = toggleMuscleSelection([], FULL_BODY_ID);
    expect(on).toEqual([FULL_BODY_ID, ...MUSCLE_FOCUS_IDS]);
    expect(toggleMuscleSelection(on, FULL_BODY_ID)).toEqual([]);
  });

  it('removing one muscle from full body drops the tag', () => {
    const on = toggleMuscleSelection([], FULL_BODY_ID);
    const next = toggleMuscleSelection(on, 'chest');
    expect(next).not.toContain(FULL_BODY_ID);
    expect(next).not.toContain('chest');
  });

  it('selecting every muscle by hand auto-upgrades to full body', () => {
    const all = MUSCLE_FOCUS_IDS.reduce<string[]>((acc, m) => toggleMuscleSelection(acc, m), []);
    expect(all).toEqual([FULL_BODY_ID, ...MUSCLE_FOCUS_IDS]);
  });

  it('persisted: full body → the 4 categories, otherwise the muscles as-is', () => {
    expect(toPersistedMuscleFocus([FULL_BODY_ID, ...MUSCLE_FOCUS_IDS])).toEqual(['push', 'pull', 'legs', 'core']);
    expect(toPersistedMuscleFocus(['back', 'biceps'])).toEqual(['back', 'biceps']);
  });
});

describe('v2 area tiles → legacy muscle state (equivalence)', () => {
  it('full → the existing full_body path, persisted as push/pull/legs/core', () => {
    expect(areaTilesToMuscles(['full'])).toEqual(toggleMuscleSelection([], FULL_BODY_ID));
    expect(persistTiles(['full'])).toEqual(['push', 'pull', 'legs', 'core']);
  });

  it('upper → push + pull packages (legacy order: pull, then push)', () => {
    expect(areaTilesToMuscles(['upper'])).toEqual(legacyTapPackages(['pull', 'push']));
    expect(persistTiles(['upper'])).toEqual(['back', 'biceps', 'shoulders', 'chest', 'triceps']);
  });

  it('legs → legs package', () => {
    expect(areaTilesToMuscles(['legs'])).toEqual(legacyTapPackages(['legs']));
    expect(persistTiles(['legs'])).toEqual(['glutes', 'legs']);
  });

  it('core → core package', () => {
    expect(areaTilesToMuscles(['core'])).toEqual(legacyTapPackages(['core']));
    expect(persistTiles(['core'])).toEqual(['core']);
  });

  it('multiple tiles = union, in tap order', () => {
    expect(areaTilesToMuscles(['legs', 'core'])).toEqual(legacyTapPackages(['legs', 'core']));
    expect(areaTilesToMuscles(['core', 'upper'])).toEqual(legacyTapPackages(['core', 'pull', 'push']));
    expect(persistTiles(['upper', 'legs'])).toEqual(['back', 'biceps', 'shoulders', 'chest', 'triceps', 'glutes', 'legs']);
  });

  it('all three partial tiles = what the legacy UI persists for every package (full body)', () => {
    const legacy = toPersistedMuscleFocus(legacyTapPackages(['pull', 'push', 'legs', 'core']));
    expect(legacy).toEqual(['push', 'pull', 'legs', 'core']);
    // The tile reducer collapses that pick to "full" itself.
    let tiles: AreaTileId[] = ['full'];
    tiles = toggleAreaTile(tiles, 'upper');
    tiles = toggleAreaTile(tiles, 'legs');
    tiles = toggleAreaTile(tiles, 'core');
    expect(tiles).toEqual(['full']);
    expect(persistTiles(tiles)).toEqual(legacy);
  });

  it('no tiles → nothing (Continue stays blocked, same as no chips)', () => {
    expect(areaTilesToMuscles([])).toEqual([]);
  });
});

describe('toggleAreaTile', () => {
  it('full is exclusive', () => {
    expect(toggleAreaTile(['upper', 'legs'], 'full')).toEqual(['full']);
  });
  it('a partial tile replaces full, toggles, and empty falls back to full', () => {
    expect(toggleAreaTile(['full'], 'upper')).toEqual(['upper']);
    expect(toggleAreaTile(['upper'], 'legs')).toEqual(['upper', 'legs']);
    expect(toggleAreaTile(['upper', 'legs'], 'upper')).toEqual(['legs']);
    expect(toggleAreaTile(['legs'], 'legs')).toEqual(['full']);
  });
});

describe('coach gate is unchanged for tile picks', () => {
  it('full / upper+legs: no note', () => {
    expect(deriveMuscleBalanceCase(areaTilesToMuscles(['full']))).toBeNull();
    expect(deriveMuscleBalanceCase(areaTilesToMuscles(['upper', 'legs']))).toBeNull();
  });
  it('upper only → upper_only, highlights legs + core tiles', () => {
    const c = deriveMuscleBalanceCase(areaTilesToMuscles(['upper']));
    expect(c).toBe('upper_only');
    expect(Array.from(recommendedAreaTiles(recommendedMusclesForCase(c), ['upper'])).sort()).toEqual(['core', 'legs']);
  });
  it('legs / core only → lower_only, highlights the upper tile', () => {
    for (const t of ['legs', 'core', 'legs+core'] as const) {
      const tiles = (t === 'legs+core' ? ['legs', 'core'] : [t]) as AreaTileId[];
      const c = deriveMuscleBalanceCase(areaTilesToMuscles(tiles));
      expect(c).toBe('lower_only');
      expect(Array.from(recommendedAreaTiles(recommendedMusclesForCase(c), tiles))).toEqual(['upper']);
    }
  });
});
