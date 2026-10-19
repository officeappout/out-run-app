/**
 * Kelly phase 2 — off is byte-identical (session prompt), the turn extras (quick replies,
 * the builder chip after a refused proposal) and the reply guard against "I already saved".
 */
import { describe, it, expect } from 'vitest';
import { buildSessionContext, PHASE2_NOTE } from '../persona';
import { phase2TurnExtras } from '../phase2-turn';
import { checkReply, correctionNote } from '../reply-guards';
import { findSavedClaim } from '../schedule-proposal/claims';
import { OWNER_SHEET } from './owner-sheet.fixture';

const ctx = { firstName: 'דוד', gender: 'male' as const, todayKey: '2026-10-18', israelDayOfWeek: 0, israelHour: 10, sheet: OWNER_SHEET };

describe('session context', () => {
  it('off = the exact old block; on = + the phase 2 note', () => {
    expect(buildSessionContext({ ...ctx, phase2: false })).toBe(buildSessionContext(ctx));
    const on = buildSessionContext({ ...ctx, phase2: true });
    expect(on).toContain(PHASE2_NOTE);
    expect(on.replace(`\n${PHASE2_NOTE}`, '')).toBe(buildSessionContext(ctx));
  });
});

describe('phase2TurnExtras', () => {
  const base = { sheet: OWNER_SHEET, profile: null, gender: 'male' as const, now: new Date('2026-10-18T07:00:00Z'), todayKey: '2026-10-18', hour: 10, userText: 'x', actions: [] };
  it('a refused proposal adds the builder chip; a created one adds no quick replies', () => {
    const refused = phase2TurnExtras({ ...base, toolNames: ['propose_schedule_change'], proposalCreated: false });
    expect(refused.actions).toContain('open_builder');
    const created = phase2TurnExtras({ ...base, toolNames: ['propose_schedule_change'], proposalCreated: true });
    expect(created.actions).not.toContain('open_builder');
    expect(created.suggestions).toEqual([]);
  });
  it('a built workout → start / shorter / …', () => {
    const r = phase2TurnExtras({ ...base, toolNames: ['generate_workout'], workoutInput: { location: 'home', durationMin: 20, domains: ['core'] }, proposalCreated: false });
    expect(r.suggestions.map((s) => s.id)).toEqual(['start', 'shorter', 'easier']);
  });
});

describe('unconfirmed-save guard', () => {
  it('flags past-tense claims only when propose_schedule_change ran', () => {
    expect(findSavedClaim('הזזתי את האימון לרביעי.')).toBe('הזזתי');
    expect(findSavedClaim('הלו״ז עודכן.')).toBe('עודכן');
    expect(findSavedClaim('השינוי יישמר אחרי שתאשר.')).toBeNull();
    const blind = { userText: 'תזיז', toolNames: ['propose_schedule_change'] };
    const issues = checkReply('הזזתי את האימון לרביעי.', null, 'male', blind);
    expect(issues.some((i) => i.kind === 'unconfirmed_save')).toBe(true);
    expect(correctionNote(issues)).toMatch(/nothing is saved yet/);
    expect(checkReply('הזזתי את האימון לרביעי.', null, 'male', { userText: 'x', toolNames: [] }).some((i) => i.kind === 'unconfirmed_save')).toBe(false);
  });
});
