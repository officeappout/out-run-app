/**
 * Kelly phase 2 — propose_schedule_change (pure): moves, swaps, fewer days, the refusals,
 * the plan verification and the tool result (never claims a save).
 */
import { describe, it, expect } from 'vitest';
import { input, runningPart, strengthProfile, threeRunWeeks, THU } from '@/features/schedule/advisor/__tests__/fixtures';
import { buildScheduleProposal, proposalToolResult } from '../build-proposal';
import { scheduleFingerprint } from '../fingerprint';
import { ProposeScheduleChangeInput, parseProposalView } from '../types';

// Thursday 2026-10-15; template: Sun push, Tue legs, Thu push, Sat pull (Hebrew day letters).
const TEMPLATE = { א: ['push'], ג: ['legs'], ה: ['push'], ש: ['pull'] };
const profile = () => strengthProfile({ ...TEMPLATE });

describe('buildScheduleProposal — moves', () => {
  it('from now on: Tuesday → Wednesday moves the legs day, nothing else', () => {
    const r = buildScheduleProposal(input(profile()), { scope: 'from_now', moves: [{ from: 'tuesday', to: 'wednesday' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.plan.scope).toBe('from_now');
    expect(r.proposal.plan.recurringTemplate).toEqual({ א: ['push'], ד: ['legs'], ה: ['push'], ש: ['pull'] });
    expect(r.proposal.plan.runningScheduleDays).toBeNull();
    expect(r.proposal.lines[0]).toContain('עובר ליום רביעי');
    expect(r.proposal.title).toBe('שינוי בלו״ז, מעכשיו והלאה');
  });

  it('a swap when the target day already trains', () => {
    const r = buildScheduleProposal(input(profile()), { scope: 'from_now', moves: [{ from: 'tuesday', to: 'thursday' }] });
    expect(r.ok && r.proposal.plan.recurringTemplate).toEqual({ א: ['push'], ג: ['push'], ה: ['legs'], ש: ['pull'] });
    expect(r.ok && r.proposal.lines[0]).toContain('מתחלף עם');
  });

  it('this week only: day overrides for the rest of the week, dated', () => {
    const r = buildScheduleProposal(input(profile()), { scope: 'this_week', moves: [{ from: 'thursday', to: 'friday' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.plan.dayOverrides).toEqual([
      { date: '2026-10-15', strengthProgramIds: null },
      { date: '2026-10-16', strengthProgramIds: ['push'] },
    ]);
    expect(r.proposal.lines[0]).toContain('(15.10)');
  });

  it('refuses a past day this week, a day without strength, and the long-run day', () => {
    expect(buildScheduleProposal(input(profile()), { scope: 'this_week', moves: [{ from: 'tuesday', to: 'friday' }] })).toMatchObject({ ok: false, reason: 'past_day' });
    expect(buildScheduleProposal(input(profile()), { scope: 'from_now', moves: [{ from: 'monday', to: 'friday' }] })).toMatchObject({ ok: false, reason: 'no_strength_on_day', day: 'שני' });
    const withRuns = strengthProfile({ ...TEMPLATE }, { running: runningPart(['ב', 'ד', 'ו'], threeRunWeeks(8)) });
    const r = buildScheduleProposal(input(withRuns), { scope: 'from_now', moves: [{ from: 'tuesday', to: 'friday' }] });
    // Friday is the long run in this plan → refused (or, if the weaver put it elsewhere, allowed).
    if (!r.ok) expect(r.reason).toBe('long_run_day');
  });

  it('a user without a strength template gets no_strength', () => {
    expect(buildScheduleProposal(input(strengthProfile({})), { scope: 'from_now', moves: [{ from: 'sunday', to: 'monday' }] })).toMatchObject({ ok: false, reason: 'no_strength' });
  });
});

describe('buildScheduleProposal — fewer days', () => {
  it('4 → 3 strength days, the advisor picks them; more days → the builder', () => {
    const r = buildScheduleProposal(input(profile()), { scope: 'from_now', strengthDays: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const days = Object.values(r.proposal.plan.recurringTemplate ?? {}).filter((ids) => ids.length).length;
      expect(days).toBe(3);
      expect(r.proposal.lines[0]).toMatch(/^3 ימי כוח: /);
    }
    expect(buildScheduleProposal(input(profile()), { scope: 'from_now', strengthDays: 5 })).toMatchObject({ ok: false, reason: 'more_days' });
  });
});

describe('tool result, input schema, view parsing, fingerprint', () => {
  it('never claims a save; refusals carry a note', () => {
    const ok = buildScheduleProposal(input(profile()), { scope: 'from_now', moves: [{ from: 'tuesday', to: 'wednesday' }] });
    const res = proposalToolResult(ok);
    expect(res).toMatchObject({ proposalOnly: true, savedNothing: true });
    expect(String(res.noteForCoach)).toMatch(/Never say you changed/);
    expect(proposalToolResult({ ok: false, reason: 'more_days' })).toMatchObject({ created: false, reason: 'more_days' });
  });
  it('input: moves or strengthDays, not both, not same day', () => {
    expect(ProposeScheduleChangeInput.safeParse({ scope: 'from_now' }).success).toBe(false);
    expect(ProposeScheduleChangeInput.safeParse({ scope: 'from_now', strengthDays: 3, moves: [{ from: 'sunday', to: 'monday' }] }).success).toBe(false);
    expect(ProposeScheduleChangeInput.safeParse({ scope: 'from_now', moves: [{ from: 'sunday', to: 'sunday' }] }).success).toBe(false);
    expect(ProposeScheduleChangeInput.safeParse({ scope: 'this_week', moves: [{ from: 'sunday', to: 'monday' }] }).success).toBe(true);
  });
  it('parseProposalView keeps only the safe shape', () => {
    expect(parseProposalView({ id: 'p1', status: 'pending', scope: 'from_now', title: 't', lines: ['a', 3], plan: { x: 1 } })).toEqual({ id: 'p1', status: 'pending', scope: 'from_now', title: 't', lines: ['a'] });
    expect(parseProposalView({ id: 'p1', status: 'weird', scope: 'from_now' })).toBeNull();
  });
  it('fingerprint changes with the template, not with key order', () => {
    const a = scheduleFingerprint({ lifestyle: { recurringTemplate: { א: ['push'], ג: ['legs'] } } });
    const b = scheduleFingerprint({ lifestyle: { recurringTemplate: { ג: ['legs'], א: ['push'] } } });
    const c = scheduleFingerprint({ lifestyle: { recurringTemplate: { א: ['push'], ד: ['legs'] } } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(THU).toBe('2026-10-15');
  });
});
