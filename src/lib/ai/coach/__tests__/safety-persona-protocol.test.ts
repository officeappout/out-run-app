import { describe, it, expect } from 'vitest';
import { violatesVoice } from '@/features/workout-engine/services/coach-note';
import { detectSafetyTrigger, safetyReply } from '../safety';
import { COACH_SYSTEM_PROMPT, buildSessionContext, greeting, quickReplies } from '../persona';
import { createSseParser, describeCoachError, encodeSse, workoutCardLabel } from '../protocol';

describe('safety gate', () => {
  it.each([
    ['יש לי כאב בחזה כשאני רץ', 'chest'],
    ['מרגיש לחץ בחזה', 'chest'],
    ['קוצר נשימה אחרי מדרגות', 'breath'],
    ['קצת מסוחררת היום', 'dizziness'],
    ['אני בהריון, אפשר אימון?', 'pregnancy'],
    ['היריון שבוע 20', 'pregnancy'],
    ['נפצעתי בברך באימון', 'injury'],
    ['I think I sprained my ankle', 'injury'],
  ])('%s → %s', (text, trigger) => {
    expect(detectSafetyTrigger(text)).toBe(trigger);
  });

  it.each(['תבנה לי אימון בטן ורגליים בבית', 'איך אני מתקדם?', 'מה בתוכנית השבוע?', 'אימון רגליים קשה'])(
    'no trigger: %s',
    (text) => expect(detectSafetyTrigger(text)).toBeNull(),
  );

  it('fixed reply: doctor + 101, brand voice, gendered', () => {
    for (const g of ['male', 'female', 'other'] as const) {
      for (const t of ['chest', 'pregnancy', 'injury'] as const) {
        const r = safetyReply(t, g);
        expect(r).toContain('101');
        expect(r).toMatch(/רופא/);
        expect(violatesVoice(r)).toBe(false);
        expect(r).not.toContain('/');
      }
    }
    expect(safetyReply('chest', 'male')).toContain('התקשר מיד');
    expect(safetyReply('chest', 'female')).toContain('התקשרי מיד');
  });
});

describe('persona', () => {
  it('system prompt is stable (no dates, no per-user data)', () => {
    expect(COACH_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(COACH_SYSTEM_PROMPT).toContain('101');
    expect(COACH_SYSTEM_PROMPT).toMatch(/Never invent/);
  });
  it('session context carries grammar, date and summary', () => {
    const s = buildSessionContext({ firstName: 'דוד', gender: 'male', todayKey: '2026-10-18', israelDayOfWeek: 0, israelHour: 9, summary: 'רוצה לחזק רגליים' });
    expect(s).toContain('masculine');
    expect(s).toContain('יום ראשון, 2026-10-18');
    expect(s).toContain('רוצה לחזק רגליים');
  });
  it('quick replies + greeting are gendered, no slashes, brand voice', () => {
    expect(quickReplies('female')).toContain('איך אני מתקדמת?');
    expect(quickReplies('male')).toContain('איך אני מתקדם?');
    expect(quickReplies('other').join(' ')).not.toContain('/');
    for (const g of ['male', 'female', 'other'] as const) {
      expect(violatesVoice(greeting(g, 'דנה'))).toBe(false);
      for (const q of quickReplies(g)) expect(violatesVoice(q)).toBe(false);
    }
  });
});

describe('protocol', () => {
  it('SSE parser survives arbitrary chunk boundaries', () => {
    const wire =
      encodeSse({ type: 'text', delta: 'שלום ' }) +
      encodeSse({ type: 'client_tool', id: 't1', name: 'generate_workout', input: { durationMin: 20 } }) +
      encodeSse({ type: 'done', messageId: 'm1' });
    const parse = createSseParser();
    const events = [];
    for (let i = 0; i < wire.length; i += 7) events.push(...parse(wire.slice(i, i + 7)));
    expect(events.map((e) => e.type)).toEqual(['text', 'client_tool', 'done']);
    expect(events[0]).toEqual({ type: 'text', delta: 'שלום ' });
  });

  it('card label', () => {
    expect(workoutCardLabel({ title: 'אימון בטן ורגליים בבית', minutes: 25, exerciseCount: 6 })).toBe('אימון בטן ורגליים בבית · 25 דק׳ · 6 תרגילים');
  });

  it('maps rate limit / budget / offline / auth errors to friendly Hebrew', () => {
    const hour = describeCoachError({ status: 429, code: 'rate_limited', retryAfterSec: 3600 }, 'male');
    expect(hour).toMatchObject({ offerBuilder: true, retryable: false });
    expect(hour.body).toContain('בעוד שעה');
    expect(describeCoachError({ status: 429, retryAfterSec: 86_400 }, 'male').body).toContain('מחר');
    for (const code of ['kill_switch', 'over_budget', 'unavailable']) {
      expect(describeCoachError({ status: 503, code }, 'female')).toMatchObject({ title: 'קלי AI לא זמין כרגע', offerBuilder: true });
    }
    expect(describeCoachError({ code: 'overloaded' }, 'other').offerBuilder).toBe(true);
    expect(describeCoachError({ offline: true }, 'male')).toMatchObject({ title: 'אין חיבור', offerBuilder: true });
    expect(describeCoachError({ status: 403, code: 'ai_not_available' }, 'male').retryable).toBe(false);
    expect(describeCoachError({}, 'female').body).toBe('נסי שוב בעוד רגע.');
    for (const e of [{ status: 429 }, { status: 503 }, { offline: true }, { status: 401 }, {}]) {
      const d = describeCoachError(e, 'other');
      // "קלי AI" is the product name; everything else must be brand voice.
      expect(violatesVoice(d.title.replaceAll('AI', '')) || violatesVoice(d.body.replaceAll('AI', ''))).toBe(false);
    }
  });
});
