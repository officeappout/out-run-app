/** Per-date run moves (running.runMoves, enable_week_builder_v1). Week of Sun 18.10.2026. */
import { describe, expect, it } from 'vitest';
import {
  applyRunMovesToDowMap,
  mergeRunMoves,
  normalizeRunMoves,
  planRunMoves,
  RUN_MOVES_MAX,
  runSourceDate,
  sundayKeyOf,
} from '../runWeekMoves';
import { runPlacementOf } from '../runWeekByType';

const SUN = '2026-10-18';
const MON = '2026-10-19';
const TUE = '2026-10-20';
const WED = '2026-10-21';
const THU = '2026-10-22';
const FRI = '2026-10-23';

describe('normalizeRunMoves', () => {
  it('keeps same-week moves, drops bad, no-op and cross-week items', () => {
    expect(
      normalizeRunMoves([
        { from: MON, to: THU },
        { from: MON, to: MON },
        { from: '2026-10-24', to: '2026-10-25' },
        { from: 'x', to: THU },
        null,
      ]),
    ).toEqual([{ from: MON, to: THU }]);
    expect(normalizeRunMoves(undefined)).toEqual([]);
  });

  it('runPlacementOf carries it only when present (no field = the old object)', () => {
    expect(runPlacementOf({})).not.toHaveProperty('runMoves');
    expect(runPlacementOf({ runMoves: [{ from: MON, to: THU }] }).runMoves).toEqual([{ from: MON, to: THU }]);
  });
});

describe('runSourceDate', () => {
  it('a move to an empty day: the run shows on the new day, the old day is the empty day', () => {
    const moves = [{ from: MON, to: THU }];
    expect(runSourceDate(THU, moves)).toBe(MON);
    expect(runSourceDate(MON, moves)).toBe(THU);
    expect(runSourceDate(TUE, moves)).toBe(TUE);
  });

  it('moves compose in order and only touch their own week', () => {
    const moves = [{ from: MON, to: THU }, { from: THU, to: FRI }];
    expect(runSourceDate(FRI, moves)).toBe(MON);
    expect(runSourceDate('2026-10-26', moves)).toBe('2026-10-26');
    expect(sundayKeyOf(WED)).toBe(SUN);
  });

  it('re-lays a weekday map', () => {
    const map = new Map([[1, 'easy'], [3, 'long']]);
    const out = applyRunMovesToDowMap(map, SUN, [{ from: MON, to: TUE }]);
    expect(Array.from(out.entries()).sort()).toEqual([[2, 'easy'], [3, 'long']]);
  });
});

describe('planRunMoves (one builder save)', () => {
  it('a run to an empty day = one move', () => {
    expect(planRunMoves(undefined, [{ from: MON, to: THU }])).toEqual([{ from: MON, to: THU }]);
  });

  it('a swap of two runs (two session moves) never undoes itself', () => {
    const swaps = planRunMoves(undefined, [{ from: MON, to: WED }, { from: WED, to: MON }]);
    expect(runSourceDate(MON, swaps)).toBe(WED);
    expect(runSourceDate(WED, swaps)).toBe(MON);
  });

  it('builds on what is already stored (shown dates are after the stored moves)', () => {
    const stored = [{ from: MON, to: THU }];
    const next = planRunMoves(stored, [{ from: THU, to: FRI }]);
    const all = [...stored, ...next];
    expect(runSourceDate(FRI, all)).toBe(MON);
    expect(runSourceDate(THU, all)).toBe(FRI);
  });
});

describe('mergeRunMoves', () => {
  it('prunes ended weeks, appends, caps', () => {
    const old = [{ from: '2026-10-12', to: '2026-10-13' }];
    expect(mergeRunMoves(old, [{ from: MON, to: THU }], WED)).toEqual([{ from: MON, to: THU }]);
    const many = Array.from({ length: 20 }, () => ({ from: MON, to: THU }));
    expect(mergeRunMoves([], many, WED)).toHaveLength(RUN_MOVES_MAX);
  });
});
