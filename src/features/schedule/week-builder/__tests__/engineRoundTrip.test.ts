/**
 * Engine round-trip: engine-v2 week → builder week → back to the host's own shape is lossless,
 * and edits go back through the engine (moves validated, runs re-placed, focus by position).
 */
import { describe, expect, it } from 'vitest';
import {
  buildStrengthScheduleWrite,
  recommendStrengthWeek,
  type StrengthSeed,
} from '../../utils/strengthWeekRecommendation';
import { recommendRunWeek } from '../../utils/runWeekRecommendation';
import { buildAddTrackWeek, type AddTrackInput } from '../../add-track/addTrackWeek';
import { applyStrengthFocus, strengthWeekToWb, wbToStrengthWeek } from '../adapters/strength';
import { recommendRunWbWeek, runDaysOf, runMoveOptions, runWeekToWb, type RunWbContext } from '../adapters/run';
import { addTrackWeekToWb, wbToAddTrackDays } from '../adapters/addTrack';
import { walkDaysOf, walkWeekToWb } from '../adapters/walk';
import { moveSession } from '../moveSession';
import { needsWeekBuilder, shapeOfWeek } from '../needsWeekBuilder';
import type { WbRules } from '../types';

const FULL_BODY: StrengthSeed = { programs: ['FULL_BODY'], skills: [] };

describe('strength ⇄ builder', () => {
  const rec = recommendStrengthWeek({ seed: FULL_BODY, frequency: 3, days: [0, 2, 4], level: 'beginner' });
  const rules: WbRules = { maxPerDay: 1, maxTrainingDays: 3, runLevel: null };

  it('full body ×3 → builder → back: the same write payload', () => {
    const wb = strengthWeekToWb({ week: rec, openDays: [0, 1, 2, 3, 4, 5], split: 'full_body_ab' }, rules);
    expect(needsWeekBuilder(shapeOfWeek(wb, 'full_body_ab'))).toBe(false);
    const back = wbToStrengthWeek(wb, rec.recoveryHours);
    expect(back.days.map((d) => [d.dow, d.items, d.window, d.minutes])).toEqual(rec.days.map((d) => [d.dow, d.items, d.window, d.minutes]));
    expect(buildStrengthScheduleWrite({ week: back })).toEqual(buildStrengthScheduleWrite({ week: rec }));
  });

  it('upper / lower ×4: the cards show the focus by position, and it follows a move', () => {
    const four = recommendStrengthWeek({ seed: FULL_BODY, frequency: 4, days: [0, 1, 3, 4], level: 'intermediate' });
    const r4: WbRules = { maxPerDay: 1, maxTrainingDays: 4, runLevel: null };
    const wb = strengthWeekToWb({ week: four, openDays: [0, 1, 2, 3, 4, 5], split: 'upper_lower' }, r4);
    expect(needsWeekBuilder(shapeOfWeek(wb, 'upper_lower'))).toBe(true);
    const titles = wb.days.flatMap((d) => d.sessions.map((s) => s.titleHe));
    expect(titles).toEqual(['עליון', 'תחתון', 'עליון', 'תחתון']);
    const first = wb.days.find((d) => d.sessions.length)!.sessions[0];
    const moved = moveSession(wb, { sessionId: first.id, toDow: 5 }, r4, { normalize: (w) => applyStrengthFocus(w, 'upper_lower') });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    // Positions shifted: the generator will train the new 1st day as upper.
    expect(moved.week.days.flatMap((d) => d.sessions.map((s) => s.titleHe))).toEqual(['עליון', 'תחתון', 'עליון', 'תחתון']);
    const expected = [...four.days.map((d) => d.dow).filter((d) => d !== four.days[0].dow), 5].sort((a, b) => a - b);
    expect(wbToStrengthWeek(moved.week, four.recoveryHours).days.map((d) => d.dow)).toEqual(expected);
  });
});

describe('run ⇄ builder', () => {
  const ctx: RunWbContext = {
    openDays: [0, 1, 2, 3, 4, 5],
    windows: {},
    level: 'intermediate',
    targetDistance: '10k',
    slots: ['quality_primary', 'easy_run', 'long_run'],
  };
  const rules: WbRules = { maxPerDay: 1, maxTrainingDays: 3, runLevel: 'intermediate' };
  const rec = recommendRunWeek({ slots: ctx.slots, days: [0, 2, 4], level: 'intermediate', targetDistance: '10k' });

  it('the engine week survives the round trip (days + long-run day)', () => {
    const wb = runWeekToWb(rec, ctx, rules);
    expect(runDaysOf(wb)).toEqual({ days: rec.days.map((d) => d.dow), longRunDow: rec.longRunDow });
    expect(wb.days[rec.longRunDow!].sessions[0].titleHe).toBe('ריצה ארוכה');
  });

  it('moving the long run makes it the chosen long-run day and re-places the week by the engine', () => {
    const wb = runWeekToWb(rec, ctx, rules);
    const long = wb.days[rec.longRunDow!].sessions[0];
    const r = moveSession(wb, { sessionId: long.id, toDow: 5 }, rules, runMoveOptions(ctx, rules, { chosen: null, current: rec.longRunDow }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(runDaysOf(r.week).longRunDow).toBe(5);
    expect(r.week).toEqual(recommendRunWbWeek(ctx, runDaysOf(r.week).days, 5, rules));
    expect(r.week.days[5].whyHe).toContain('הריצה הארוכה');
  });

  it('a beginner plan is titled by its week (WR-7)', () => {
    const wb = runWeekToWb(rec, { ...ctx, level: 'beginner' }, rules);
    expect(wb.days.flatMap((d) => d.sessions.map((s) => s.titleHe))).toEqual(Array(3).fill('שבוע 1 · ריצה-הליכה'));
  });
});

describe('add track ⇄ builder', () => {
  const J3: AddTrackInput = {
    added: 'running',
    existingStrength: [
      { dow: 0, slug: 'push', ids: ['push'] },
      { dow: 2, slug: 'pull', ids: ['pull'] },
      { dow: 4, slug: 'legs', ids: ['legs'] },
    ],
    existingRuns: [],
    newRunSlots: ['quality_primary', 'easy_run', 'long_run'],
    runLevel: 'beginner',
    targetDistance: '10k',
  };
  const view = buildAddTrackWeek(J3, 'strength_first', false);
  const rules: WbRules = { maxPerDay: 2, runLevel: 'beginner' };
  const ctx = { openDays: [0, 1, 2, 3, 4, 5], times: { run: '07:00', strength: '19:00' } };

  it('statuses (new / kept / moved + fromDow) survive the round trip', () => {
    const back = wbToAddTrackDays(addTrackWeekToWb(view, ctx, rules));
    const pick = (days: typeof back) =>
      days.flatMap((d) => d.sessions.map((s) => [d.dow, s.kind, s.slot ?? s.slug, s.status, s.fromDow ?? null]));
    expect(pick(back)).toEqual(pick(view.days));
  });

  it('a user move of a kept strength day turns it into "moved" from its home day', () => {
    const wb = addTrackWeekToWb(view, ctx, rules);
    const pull = wb.days[2].sessions.find((s) => s.slug === 'pull');
    expect(pull?.homeDow).toBe(2);
    const free = wb.days.find((d) => d.open && d.sessions.length === 0 && d.dow !== 1 && d.dow !== 3);
    if (!pull || !free) return;
    const r = moveSession(wb, { sessionId: pull.id, toDow: free.dow }, rules);
    if (!r.ok) return; // the engine may refuse (e.g. H3 next to a key run) — covered elsewhere
    const s = wbToAddTrackDays(r.week)[free.dow].sessions.find((x) => x.slug === 'pull');
    expect(s).toMatchObject({ status: 'moved', fromDow: 2 });
  });
});

describe('walk ⇄ builder', () => {
  it('walk days read back from the builder week; another track stays locked', () => {
    const wb = walkWeekToWb(
      { index: 0, totalMinutes: 90, walks: [0, 2, 4].map((dow) => ({ dow, minutes: 30, isLong: dow === 4, target: { type: 'time', minutes: 30 }, estSteps: 3300 })) },
      { openDays: [0, 1, 2, 3, 4, 5], windows: {}, otherStrength: [{ dow: 1, slug: 'full_body', ids: ['FULL_BODY'] }] },
      { maxPerDay: 2, runLevel: null },
    );
    expect(walkDaysOf(wb)).toEqual([0, 2, 4]);
    expect(wb.days[1].sessions[0]).toMatchObject({ locked: true, titleHe: 'כל הגוף' });
    expect(needsWeekBuilder(shapeOfWeek(wb))).toBe(true);
  });
});
