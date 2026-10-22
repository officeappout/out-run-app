import { describe, expect, it } from 'vitest';
import { dropReasonHe } from '@/features/schedule/week-builder/dropReasons';
import type { WbRules } from '@/features/schedule/week-builder/types';
import { OPEN_SUN_FRI, run, strength, walk, week } from '@/features/schedule/week-builder/__tests__/fixtures';
import { BuilderContextSchema, builderContextOf, parseBuilderMoves } from '../builder-context';
import { buildBuilderProposal, builderToolResult } from '../build-builder-proposal';
import { ProposeScheduleChangeInput, parseProposalView, proposalView } from '../types';
import { decideTransition } from '../lifecycle';

const TWO: WbRules = { maxPerDay: 2, runLevel: 'intermediate' };
const ONE: WbRules = { maxPerDay: 1, runLevel: null };
const input = (moves: Array<{ from: string; to: string; track?: string }>) => ProposeScheduleChangeInput.parse({ scope: 'this_week', moves });

describe('builder context (the draft week on the wire)', () => {
  it('round-trips through the request schema, host data stays home', () => {
    const w = week(OPEN_SUN_FRI, [[0, { ...strength('a', 'push'), data: { secret: 1 } } as never], [3, run('r', 'long_run')]]);
    const ctx = builderContextOf(w, TWO);
    expect(BuilderContextSchema.parse(ctx)).toEqual(ctx);
    expect(JSON.stringify(ctx)).not.toContain('secret');
  });

  it('refuses a week that is not 7 days Sunday first', () => {
    const ctx = builderContextOf(week(OPEN_SUN_FRI, []), ONE);
    expect(BuilderContextSchema.safeParse({ ...ctx, days: ctx.days.slice(1) }).success).toBe(false);
    expect(BuilderContextSchema.safeParse({ ...ctx, days: [...ctx.days].reverse() }).success).toBe(false);
  });
});

describe('propose_schedule_change in builder mode — validated like a drag, per track', () => {
  it('strength: a valid move becomes a raw move of the week on screen', () => {
    const ctx = builderContextOf(week(OPEN_SUN_FRI, [[0, strength('a', 'full_body')], [2, strength('b', 'full_body')], [4, strength('c', 'full_body')]]), { ...ONE, maxTrainingDays: 3 });
    const b = buildBuilderProposal(ctx, input([{ from: 'thursday', to: 'friday' }]));
    expect(b).toMatchObject({ ok: true, moves: [{ from: 4, to: 5, sessionId: 'c' }], skipped: [] });
  });

  it('strength onto the long-run day is skipped with the drag reason (H2)', () => {
    const ctx = builderContextOf(week(OPEN_SUN_FRI, [[1, strength('s', 'upper_body')], [5, run('l', 'long_run')]]), TWO);
    const b = buildBuilderProposal(ctx, input([{ from: 'monday', to: 'friday' }]));
    expect(b).toEqual({ ok: false, reason: 'nothing_valid', skipped: [{ from: 1, to: 5, code: 'refused', reasonHe: dropReasonHe('H2') }] });
  });

  it('run: two quality runs 24h apart are refused (H4), a valid run move lands', () => {
    const ctx = builderContextOf(week(OPEN_SUN_FRI, [[0, run('q1', 'quality_primary')], [3, run('q2', 'quality_secondary')], [5, run('l', 'long_run')]]), TWO);
    const bad = buildBuilderProposal(ctx, input([{ from: 'wednesday', to: 'monday' }]));
    expect(bad.ok).toBe(false);
    expect(bad.skipped[0]).toMatchObject({ code: 'refused', reasonHe: dropReasonHe('H4') });
    const good = buildBuilderProposal(ctx, input([{ from: 'wednesday', to: 'tuesday' }]));
    expect(good).toMatchObject({ ok: true, moves: [{ from: 3, to: 2, sessionId: 'q2' }] });
  });

  it('walk: moves too; a closed day is refused', () => {
    const ctx = builderContextOf(week(OPEN_SUN_FRI, [[1, walk('w1')], [3, walk('w2')]]), ONE);
    expect(buildBuilderProposal(ctx, input([{ from: 'monday', to: 'tuesday' }]))).toMatchObject({ ok: true, moves: [{ sessionId: 'w1', to: 2 }] });
    const closed = buildBuilderProposal(ctx, input([{ from: 'monday', to: 'saturday' }]));
    expect(closed.skipped[0]).toMatchObject({ code: 'refused', reasonHe: dropReasonHe('closed') });
  });

  it('a day with two sessions needs track; with it the right session moves', () => {
    const ctx = builderContextOf(week(OPEN_SUN_FRI, [[1, run('r', 'easy_run')], [1, strength('s', 'upper_body')]]), TWO);
    expect(buildBuilderProposal(ctx, input([{ from: 'monday', to: 'wednesday' }])).skipped[0].code).toBe('which_session');
    expect(buildBuilderProposal(ctx, input([{ from: 'monday', to: 'wednesday', track: 'strength' }]))).toMatchObject({ ok: true, moves: [{ sessionId: 's', to: 3 }] });
  });

  it('an empty / locked from-day is skipped; valid moves in the same list still land, in order', () => {
    const locked = { ...strength('x', 'push'), locked: true };
    const ctx = builderContextOf(week(OPEN_SUN_FRI, [[0, locked], [2, strength('b', 'pull')]]), ONE);
    const b = buildBuilderProposal(ctx, input([{ from: 'sunday', to: 'monday' }, { from: 'thursday', to: 'friday' }, { from: 'tuesday', to: 'thursday' }]));
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.moves).toEqual([{ from: 2, to: 4, sessionId: 'b' }]);
    expect(b.skipped.map((s) => s.code)).toEqual(['no_session_on_day', 'no_session_on_day']);
    const r = builderToolResult(b);
    expect(r).toMatchObject({ savedNothing: true, weekOnScreen: true });
    expect((r.skipped as unknown[]).length).toBe(2);
  });

  it('strengthDays is the days picker, not a builder proposal', () => {
    const ctx = builderContextOf(week(OPEN_SUN_FRI, [[0, strength('a', 'push')]]), ONE);
    const b = buildBuilderProposal(ctx, ProposeScheduleChangeInput.parse({ scope: 'this_week', strengthDays: 2 }));
    expect(b).toEqual({ ok: false, reason: 'use_days_picker', skipped: [] });
  });
});

describe('builder proposals on the wire and in the life cycle', () => {
  const base = { id: 'p1', status: 'pending' as const, scope: 'this_week' as const, title: 't', lines: ['l'] };

  it('a normal proposal view is unchanged (no builderMoves key)', () => {
    expect(proposalView(base)).toEqual(base);
    expect(Object.keys(parseProposalView(base)!)).toEqual(['id', 'status', 'scope', 'title', 'lines']);
  });

  it('builderMoves survive view + parse; bad ones are dropped', () => {
    const moves = [{ from: 1, to: 3, sessionId: 's' }];
    expect(parseProposalView(proposalView({ ...base, builderMoves: moves }))?.builderMoves).toEqual(moves);
    expect(parseBuilderMoves([{ from: 9, to: 1, sessionId: 's' }])).toBeNull();
    expect(parseProposalView({ ...base, builderMoves: 'x' })?.builderMoves).toBeUndefined();
  });

  it('the save route never releases a builder proposal', () => {
    const p = { ...base, plan: {} as never, fingerprint: 'builder', createdAtMs: 0, expiresAtMs: 10, builderMoves: [{ from: 1, to: 2, sessionId: 's' }] };
    expect(decideTransition(p, 'p1', 'confirm', { nowMs: 1, todayKey: '2026-10-22' })).toEqual({ ok: false, httpStatus: 404, error: 'not_found' });
  });
});

describe('the tool list and the request in builder mode', async () => {
  const { coachToolDefinitions } = await import('../../tools');
  const { ChatRequestSchema } = await import('../../protocol');
  const { weekBuilderFor } = await import('../builder-gate');

  it('without builder the definitions are exactly the old ones; with it only propose_schedule_change differs', () => {
    const off = coachToolDefinitions({ scheduleAdvisor: true, phase2: true });
    const on = coachToolDefinitions({ scheduleAdvisor: true, phase2: true, builder: true });
    expect(JSON.stringify(coachToolDefinitions({ scheduleAdvisor: true, phase2: true, builder: false }))).toBe(JSON.stringify(off));
    expect(on.map((t) => t.name)).toEqual(off.map((t) => t.name));
    on.forEach((t, i) => {
      if (t.name === 'propose_schedule_change') expect(t.description).toContain('DRAFT week on screen');
      else expect(t).toEqual(off[i]);
    });
  });

  it('the chat request accepts an optional builder context; a bad one is a bad request', () => {
    const builder = builderContextOf(week(OPEN_SUN_FRI, []), ONE);
    expect(ChatRequestSchema.safeParse({ message: 'hi', builder }).success).toBe(true);
    expect(ChatRequestSchema.safeParse({ message: 'hi', builder: { days: [] } }).success).toBe(false);
    expect(ChatRequestSchema.parse({ message: 'hi' })).toEqual({ message: 'hi' });
  });

  it('server gate: the live flag, or the super-admin preview value', () => {
    expect(weekBuilderFor({ enableWeekBuilderV1: false }, false)).toBe(false);
    expect(weekBuilderFor({ enableWeekBuilderV1: true }, false)).toBe(true);
    expect(weekBuilderFor(null, true)).toBe(true);
  });
});
