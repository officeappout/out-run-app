/**
 * RP-14 "from me" drawer tiles (enable_run_drawer_from_me_v1): loops from here
 * + one near, fitting official route; order; default selection.
 */
import { describe, it, expect } from 'vitest';
import type { RouteSuggestion } from '../../../lib/route-fit/suggest-routes-for-workout';
import type { FitVerdict, RouteWorkoutScore } from '../../../lib/route-fit/types';
import { accessReason } from '../../../lib/route-fit/score-route-for-workout';
import { ORIGIN, makeRoute, squareLoop } from '../../../lib/route-fit/__tests__/fixtures';
import { buildRouteTiles, defaultTileId, qualifyingOfficial, MAX_TILES } from '../run-route-tiles';

function sugg(id: string, opts: {
  generated: boolean; score: number; verdict?: FitVerdict; offsetM?: number; laps?: number | null; reasons?: string[]; endsAtStart?: boolean;
}): RouteSuggestion {
  const score: RouteWorkoutScore = {
    routeId: id,
    score: opts.score,
    fit: {
      verdict: opts.verdict ?? 'fits', laps: opts.laps ?? 1, endsAtStart: opts.endsAtStart ?? true,
      turnaroundKm: null, score: 1, reason: null, caution: null,
    },
    climb: null,
    reasons: opts.reasons ?? [],
    cautions: [],
  };
  return { route: makeRoute({ id, distance: 4, path: squareLoop(4000, opts.offsetM ?? 0) }), score, isGenerated: opts.generated };
}

describe('buildRouteTiles', () => {
  it('loops first by score, then the near fitting official route', () => {
    const tiles = buildRouteTiles([
      sugg('official', { generated: false, score: 90, offsetM: 600, laps: 2 }),
      sugg('loopB', { generated: true, score: 60 }),
      sugg('loopA', { generated: true, score: 80 }),
    ], ORIGIN);
    expect(tiles.map((t) => t.id)).toEqual(['loopA', 'loopB', 'official']);
    expect(tiles[2]).toMatchObject({ kind: 'official', laps: 2 });
    expect(tiles[2].accessKm).toBeGreaterThan(0.5);
    expect(tiles[2].accessKm).toBeLessThan(0.7);
    expect(tiles[0]).toMatchObject({ kind: 'loop', accessKm: null, returnsHere: true, km: 4 });
  });

  it('drops an official route that is far or does not fit', () => {
    const far = sugg('far', { generated: false, score: 95, offsetM: 1500 });
    const close = sugg('close', { generated: false, score: 95, verdict: 'close' });
    const loop = sugg('loop', { generated: true, score: 50 });
    expect(buildRouteTiles([far, close, loop], ORIGIN).map((t) => t.id)).toEqual(['loop']);
    expect(qualifyingOfficial([far, close], ORIGIN)).toBeNull();
  });

  it('caps at MAX_TILES and keeps the official slot', () => {
    const loops = ['l1', 'l2', 'l3', 'l4'].map((id, i) => sugg(id, { generated: true, score: 90 - i }));
    const off = sugg('off', { generated: false, score: 70 });
    const tiles = buildRouteTiles([...loops, off], ORIGIN);
    expect(tiles).toHaveLength(MAX_TILES);
    expect(tiles.map((t) => t.id)).toEqual(['l1', 'l2', 'off']);
    expect(buildRouteTiles(loops, ORIGIN).map((t) => t.id)).toEqual(['l1', 'l2', 'l3']);
  });

  it('only the official route when no loop came back; nothing without a position for officials', () => {
    const off = sugg('off', { generated: false, score: 70 });
    expect(buildRouteTiles([off], ORIGIN).map((t) => t.id)).toEqual(['off']);
    expect(buildRouteTiles([off], null)).toEqual([]);
  });

  it('skips loops that do not fit', () => {
    expect(buildRouteTiles([sugg('bad', { generated: true, score: 99, verdict: 'no' })], ORIGIN)).toEqual([]);
  });

  it('the green line reuses route-fit reasons without the "how far" one', () => {
    const off = sugg('off', { generated: false, score: 70, offsetM: 600, reasons: ['2 סיבובים', 'מוצל', 'מואר', 'X'] });
    const [tile] = buildRouteTiles([off], ORIGIN);
    off.score.reasons.push(accessReason(tile.accessKm!)!);
    expect(buildRouteTiles([off], ORIGIN)[0].reasons).toEqual(['2 סיבובים', 'מוצל']);
  });

  it('returnsHere is false when the loop finishes elsewhere', () => {
    const [tile] = buildRouteTiles([sugg('half', { generated: true, score: 60, endsAtStart: false })], ORIGIN);
    expect(tile.returnsHere).toBe(false);
  });
});

describe('defaultTileId', () => {
  const tiles = buildRouteTiles([sugg('a', { generated: true, score: 80 }), sugg('b', { generated: true, score: 70 })], ORIGIN);
  it('first tile by default, keeps a still-present choice', () => {
    expect(defaultTileId(tiles, null)).toBe('a');
    expect(defaultTileId(tiles, 'b')).toBe('b');
    expect(defaultTileId(tiles, 'gone')).toBe('a');
    expect(defaultTileId([], 'b')).toBeNull();
  });
});
