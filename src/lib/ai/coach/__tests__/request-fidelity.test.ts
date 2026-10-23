/**
 * ai_coach_request_fidelity (owner chat review 18-23.10.2026): flag off = the exact prompt and
 * tool results as before; on = ask where, judge the user's own week, honest set schemes.
 */
import { describe, it, expect } from 'vitest';
import { REQUEST_FIDELITY_NOTE, buildSessionContext } from '../persona';
import { builtFormatOf, clientOutcomeToToolResult } from '../turn-engine';
import { inferRequestedFormat } from '../intent';

const base = { firstName: 'דוד', gender: 'male' as const, todayKey: '2026-10-23', israelDayOfWeek: 5, israelHour: 9 };

const result = (protocol: string) => ({
  ok: true as const,
  result: {
    workoutId: 'ai-abc-123456',
    title: 'אימון בטן בבית',
    minutes: 12,
    location: 'home' as const,
    exercises: [],
    structure: 'standard',
    decisionRecord: { v: 1 as const, seed: 1, reasons: [], expect: { protocol } },
  },
});

describe('session note', () => {
  it('off: the session block is unchanged', () => {
    expect(buildSessionContext(base)).not.toContain('Where to train');
    expect(buildSessionContext({ ...base, requestFidelity: false })).toBe(buildSessionContext(base));
  });
  it('on: ask where, judge the user week on its merits, honest schemes / sets / praise', () => {
    const t = buildSessionContext({ ...base, requestFidelity: true });
    expect(t).toContain(REQUEST_FIDELITY_NOTE);
    expect(REQUEST_FIDELITY_NOTE).toMatch(/Never assume home/);
    expect(REQUEST_FIDELITY_NOTE).toMatch(/never reject the user's week only because it differs/);
    expect(REQUEST_FIDELITY_NOTE).toMatch(/counted only on the user's phone/);
  });
});

describe('set scheme honesty (owner: "טבטה" → pyramid sets)', () => {
  it('reads the named scheme', () => {
    expect(inferRequestedFormat('תבנה לי טבטה של 10 דקות')).toBe('tabata');
    expect(inferRequestedFormat('אימון EMOM קצר')).toBe('emom');
    expect(inferRequestedFormat('אימון בטן בבית')).toBeNull();
  });
  it('the decision record decides what was built', () => {
    expect(builtFormatOf({ structure: 'standard', decisionRecord: { expect: { protocol: 'pyramid' } } })).toBe('pyramid');
    expect(builtFormatOf({ structure: 'circuit' })).toBe('circuit');
  });
  it('a mismatch adds a note; a match or flag off adds none', () => {
    const mismatch = JSON.parse(String(clientOutcomeToToolResult('t', result('pyramid'), { requestedFormat: 'tabata' }).content));
    expect(mismatch.notesForCoach.join(' ')).toMatch(/asked for tabata.*built pyramid.*not a tabata/);
    const match = JSON.parse(String(clientOutcomeToToolResult('t', result('tabata'), { requestedFormat: 'tabata' }).content));
    expect(match.notesForCoach).toBeUndefined();
    const off = clientOutcomeToToolResult('t', result('pyramid'));
    expect(off).toEqual(clientOutcomeToToolResult('t', result('pyramid'), {}));
    expect(JSON.parse(String(off.content)).notesForCoach).toBeUndefined();
  });
});
