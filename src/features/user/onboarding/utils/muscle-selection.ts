/**
 * Program-path muscle selection — pure reducers.
 *
 * `toggleMuscleSelection` and `toPersistedMuscleFocus` are the legacy
 * program-path page's own reducer and Continue-time transform, moved here
 * verbatim (no behaviour change) so the v2 area tiles below can be proven
 * equivalent to them in a node-only unit test.
 *
 * v2 (enable_home_v2) replaces the 8 muscle chips with 4 area tiles:
 *   full  → the existing "כל הגוף" path
 *   upper → the push + pull packages
 *   legs  → the legs package
 *   core  → the core package
 * Each tile resolves to EXACTLY the selectedMuscles state the legacy UI
 * would hold after the equivalent package taps, so what's persisted on
 * Continue is identical.
 */
import { MUSCLE_FOCUS_IDS, MUSCLE_PACKAGES, type MusclePackageKey } from '../constants/program-path.constants';

export const FULL_BODY_ID = 'full_body';

/** Legacy chip reducer (was inline in program-path/page.tsx's toggleMuscle). */
export function toggleMuscleSelection(prev: string[], id: string): string[] {
  if (id === FULL_BODY_ID) {
    // ON  → include the full_body tag plus every individual muscle so each
    //       chip renders in its active/selected visual state.
    // OFF → clear everything.
    return prev.includes(FULL_BODY_ID) ? [] : [FULL_BODY_ID, ...MUSCLE_FOCUS_IDS];
  }
  // Individual chip tapped — always strip the full_body tag first so the
  // "כל הגוף" button deactivates when the set is no longer complete.
  const withoutFullBody = prev.filter((m) => m !== FULL_BODY_ID);
  const next = withoutFullBody.includes(id)
    ? withoutFullBody.filter((m) => m !== id)
    : [...withoutFullBody, id];
  // Auto-upgrade: if the user has now manually selected every individual
  // muscle, flip the full_body tag back on so the UI stays in sync.
  const allSelected = MUSCLE_FOCUS_IDS.every((m) => next.includes(m));
  return allSelected ? [FULL_BODY_ID, ...MUSCLE_FOCUS_IDS] : next;
}

/** Legacy Continue-time transform (was inline in handleContinue). */
export function toPersistedMuscleFocus(selectedMuscles: string[]): string[] {
  return selectedMuscles.includes(FULL_BODY_ID) ? ['push', 'pull', 'legs', 'core'] : selectedMuscles;
}

// ── v2 area tiles ────────────────────────────────────────────────────

export type AreaTileId = 'full' | 'upper' | 'legs' | 'core';

export const AREA_TILES: { id: AreaTileId; label: string; recommended?: boolean }[] = [
  { id: 'full', label: 'כל הגוף', recommended: true },
  { id: 'upper', label: 'פלג עליון' },
  { id: 'legs', label: 'רגליים וישבן' },
  { id: 'core', label: 'בטן וליבה' },
];

/** Which legacy packages each partial tile stands for. */
export const AREA_TILE_PACKAGES: Record<Exclude<AreaTileId, 'full'>, MusclePackageKey[]> = {
  // MUSCLE_PACKAGES order (pull, then push) — the order the legacy screen
  // lists them in, so a top-to-bottom "select all" gives the same array.
  upper: ['pull', 'push'],
  legs: ['legs'],
  core: ['core'],
};

const PARTIAL_TILES: Exclude<AreaTileId, 'full'>[] = ['upper', 'legs', 'core'];

/**
 * Tile tap. "כל הגוף" is exclusive; partial tiles toggle; nothing left, or
 * all three partial tiles, collapses back to "כל הגוף" (the same auto-upgrade
 * the legacy chips do when every muscle is on).
 */
export function toggleAreaTile(prev: AreaTileId[], id: AreaTileId): AreaTileId[] {
  if (id === 'full') return ['full'];
  const rest = prev.filter((t) => t !== 'full');
  const next = rest.includes(id) ? rest.filter((t) => t !== id) : [...rest, id];
  if (next.length === 0 || PARTIAL_TILES.every((t) => next.includes(t))) return ['full'];
  return next;
}

/**
 * The legacy selectedMuscles state for a tile selection — built by running
 * the legacy package "select all" (toggleMuscleSelection for every
 * not-yet-selected muscle, in declared package order) for each tile, in
 * tap order. Multiple tiles = union.
 */
export function areaTilesToMuscles(tiles: AreaTileId[]): string[] {
  if (tiles.length === 0) return [];
  if (tiles.includes('full')) return toggleMuscleSelection([], FULL_BODY_ID);
  let muscles: string[] = [];
  for (const tile of tiles) {
    if (tile === 'full') continue;
    for (const pkgKey of AREA_TILE_PACKAGES[tile]) {
      const pkg = MUSCLE_PACKAGES.find((p) => p.key === pkgKey);
      if (!pkg) continue;
      for (const m of pkg.muscles) {
        if (!muscles.includes(m)) muscles = toggleMuscleSelection(muscles, m);
      }
    }
  }
  return muscles;
}

/** Tiles to highlight while the muscle coach note is showing. */
export function recommendedAreaTiles(
  recommendedMuscles: ReadonlySet<string>,
  selectedTiles: AreaTileId[],
): Set<AreaTileId> {
  const out = new Set<AreaTileId>();
  for (const tile of PARTIAL_TILES) {
    if (selectedTiles.includes(tile)) continue;
    const muscles = AREA_TILE_PACKAGES[tile].flatMap(
      (k) => MUSCLE_PACKAGES.find((p) => p.key === k)?.muscles ?? [],
    );
    if (muscles.some((m) => recommendedMuscles.has(m))) out.add(tile);
  }
  return out;
}
