import { describe, it, expect } from 'vitest';
import { clientOutcomeToToolResult } from '../turn-engine';

const result = (extra: Record<string, unknown> = {}) => ({
  workoutId: 'ai-x-123456', title: 'אימון', minutes: 18, location: 'home' as const,
  exercises: [{ name: 'סקוואט', sets: 2, reps: 10, seconds: null }], ...extra,
});
const notesOf = (extra?: Record<string, unknown>) => {
  const block = clientOutcomeToToolResult('t1', { ok: true, result: result(extra) } as never);
  return (JSON.parse(block.content as string).notesForCoach ?? []) as string[];
};

describe('Kelly — budget light mode note', () => {
  it('weekly: tells Kelly to say why, with the owner\'s sentence', () => {
    expect(notesOf({ budgetLight: 'weekly_spent' }).join(' ')).toContain('השבוע כבר עשית את רוב הכוח, אז היום משהו קל יותר כדי שהשרירים יתאוששו');
  });
  it('daily: the "today" sentence', () => {
    expect(notesOf({ budgetLight: 'daily_spent' }).join(' ')).toContain('היום כבר עשית את הכוח שלך');
  });
  it('no budgetLight → no note (flag off is unchanged)', () => {
    expect(notesOf().some((n) => n.includes('lighter strength'))).toBe(false);
  });
});
