import { describe, expect, it } from 'vitest';
import { applyPlannedMoves } from '../applyMoves';
import { createWeekEngine } from '../moveSession';
import { dropReasonHe } from '../dropReasons';
import { OPEN_SUN_FRI, run, strength, week } from './fixtures';

describe("Kelly's builder moves → the week on screen", () => {
  it('applies valid moves through the engine and reports the changed days', () => {
    const w = week(OPEN_SUN_FRI, [[0, strength('a', 'push')], [2, strength('b', 'pull')]]);
    const r = applyPlannedMoves(w, [{ sessionId: 'b', to: 4 }], createWeekEngine({ maxPerDay: 1, runLevel: null }));
    expect(r.week.days[4].sessions.map((s) => s.id)).toEqual(['b']);
    expect(r.changedDows).toEqual([2, 4]);
    expect(r.skippedHe).toEqual([]);
  });

  it('skips an invalid move with the drag reason and a vanished session, keeps the valid ones', () => {
    const w = week(OPEN_SUN_FRI, [[1, strength('s', 'upper_body')], [3, strength('t', 'legs')], [5, run('l', 'long_run')]]);
    const engine = createWeekEngine({ maxPerDay: 2, runLevel: 'intermediate' });
    const r = applyPlannedMoves(w, [{ sessionId: 's', to: 5 }, { sessionId: 'gone', to: 2 }, { sessionId: 's', to: 2 }], engine);
    expect(r.skippedHe).toEqual([dropReasonHe('H2'), dropReasonHe('missing')]);
    expect(r.week.days[2].sessions.map((s) => s.id)).toEqual(['s']);
    expect(r.changedDows).toEqual([1, 2]);
  });

  it('nothing valid → the same week object, no changed days', () => {
    const w = week(OPEN_SUN_FRI, [[1, strength('s', 'upper_body')]]);
    const r = applyPlannedMoves(w, [{ sessionId: 's', to: 6 }], createWeekEngine({ maxPerDay: 1, runLevel: null }));
    expect(r.week).toBe(w);
    expect(r.changedDows).toEqual([]);
    expect(r.skippedHe).toEqual([dropReasonHe('closed')]);
  });

  it('the engine exposes its rules (sent to Kelly with the draft week)', () => {
    expect(createWeekEngine({ maxPerDay: 2, runLevel: 'beginner' }).rules).toEqual({ maxPerDay: 2, runLevel: 'beginner' });
  });
});
