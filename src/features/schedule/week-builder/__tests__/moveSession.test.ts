import { describe, expect, it } from 'vitest';
import { applyMove } from '../layout';
import { moveSession, weekViolations } from '../moveSession';
import { dropReasonHe } from '../dropReasons';
import type { WbRules } from '../types';
import { OPEN_SUN_FRI, run, strength, walk, week } from './fixtures';

const RULES: WbRules = { maxPerDay: 2, runLevel: 'intermediate' };
const ONE: WbRules = { maxPerDay: 1, runLevel: null };

describe('drag validation (engine v2 hard rules)', () => {
  it('a valid move lands, the day gets the engine\'s why line', () => {
    const w = week(OPEN_SUN_FRI, [[0, strength('a', 'full_body')], [2, strength('b', 'full_body')], [4, strength('c', 'full_body')]]);
    const r = moveSession(w, { sessionId: 'c', toDow: 5 }, { ...ONE, maxTrainingDays: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.week.days[4].sessions).toHaveLength(0);
    expect(r.week.days[5].sessions.map((s) => s.id)).toEqual(['c']);
    expect(r.week.days[5].whyHe).toBe('72 שעות בין אימוני כוח');
    expect(r.week.days[0].whyHe).toBe('אימון ראשון בשבוע');
  });

  it('two quality runs 24h apart snap back (H4)', () => {
    const w = week(OPEN_SUN_FRI, [[0, run('q1', 'quality_primary')], [3, run('q2', 'quality_secondary')], [5, run('l', 'long_run')]]);
    const r = moveSession(w, { sessionId: 'q2', toDow: 1 }, RULES);
    expect(r).toEqual({ ok: false, reasonHe: dropReasonHe('H4') });
  });

  it('strength onto the long-run day snaps back (H2)', () => {
    const w = week(OPEN_SUN_FRI, [[1, strength('s', 'upper_body')], [5, run('l', 'long_run')]]);
    expect(moveSession(w, { sessionId: 's', toDow: 5 }, RULES)).toEqual({ ok: false, reasonHe: dropReasonHe('H2') });
  });

  it('heavy legs the day before the long run snap back (H3)', () => {
    const w = week(OPEN_SUN_FRI, [[1, strength('s', 'legs')], [5, run('l', 'long_run')]]);
    expect(moveSession(w, { sessionId: 's', toDow: 4 }, RULES)).toEqual({ ok: false, reasonHe: dropReasonHe('H3') });
  });

  it('the same muscles within 48h snap back (H6)', () => {
    const w = week(OPEN_SUN_FRI, [[0, strength('a', 'push')], [3, strength('b', 'push')]]);
    expect(moveSession(w, { sessionId: 'b', toDow: 1 }, ONE)).toEqual({ ok: false, reasonHe: dropReasonHe('H6') });
  });

  it('a closed day ("לא פנוי") refuses the drop', () => {
    const w = week(OPEN_SUN_FRI, [[0, strength('a', 'full_body')]]);
    expect(moveSession(w, { sessionId: 'a', toDow: 6 }, ONE)).toEqual({ ok: false, reasonHe: dropReasonHe('closed') });
  });

  it('a locked session never moves', () => {
    const w = week(OPEN_SUN_FRI, [[0, { ...strength('a', 'full_body'), locked: true }]]);
    expect(moveSession(w, { sessionId: 'a', toDow: 2 }, ONE)).toEqual({ ok: false, reasonHe: dropReasonHe('locked') });
  });

  it('a new training day beyond the chosen count snaps back', () => {
    const w = week(OPEN_SUN_FRI, [[0, run('e', 'easy_run')], [0, strength('s', 'upper_body')], [3, run('l', 'long_run')]]);
    const r = moveSession(w, { sessionId: 's', toDow: 2 }, { ...RULES, maxTrainingDays: 2 });
    expect(r).toEqual({ ok: false, reasonHe: dropReasonHe('too_many_days') });
  });

  it('a full day becomes a swap with its session of the same track', () => {
    const w = week(OPEN_SUN_FRI, [[0, strength('a', 'push')], [2, strength('b', 'pull')], [4, strength('c', 'legs')]]);
    const r = moveSession(w, { sessionId: 'a', toDow: 4 }, ONE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.swappedWith).toBe('c');
    expect(r.week.days[0].sessions.map((s) => s.id)).toEqual(['c']);
    expect(r.week.days[4].sessions.map((s) => s.id)).toEqual(['a']);
  });

  it('a run joining a strength day goes first when it is a key run (H5 order)', () => {
    const w = week(OPEN_SUN_FRI, [[1, strength('s', 'upper_body')], [3, run('q', 'quality_primary')]]);
    const r = moveSession(w, { sessionId: 'q', toDow: 1 }, RULES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.week.days[1].sessions.map((s) => s.id)).toEqual(['q', 's']);
    expect(weekViolations(r.week, RULES)).toEqual([]);
  });

  it('a week the engine built with a violation stays editable (only NEW violations block)', () => {
    const w = week(OPEN_SUN_FRI, [[0, run('q1', 'quality_primary')], [1, run('q2', 'quality_secondary')], [4, walk('w')]]);
    expect(weekViolations(w, RULES).map((v) => v.rule)).toEqual(['H4']);
    expect(moveSession(w, { sessionId: 'w', toDow: 3 }, RULES).ok).toBe(true);
  });

  it('dropping on its own day is a no-op', () => {
    const w = week(OPEN_SUN_FRI, [[0, walk('w')]]);
    expect(applyMove(w, { sessionId: 'w', toDow: 0 }, 1)).toEqual({ kind: 'noop' });
  });

  it('normalize runs after a valid drop and its result is validated too', () => {
    const w = week(OPEN_SUN_FRI, [[0, strength('a', 'full_body')], [3, strength('b', 'full_body')]]);
    const toLegs = (x: typeof w) => ({ ...x, days: x.days.map((d) => ({ ...d, sessions: d.sessions.map((s) => ({ ...s, slug: 'legs' })) })) });
    expect(moveSession(w, { sessionId: 'b', toDow: 1 }, ONE, { normalize: toLegs })).toEqual({ ok: false, reasonHe: dropReasonHe('H6') });
  });
});
