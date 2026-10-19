/**
 * Kelly phase 3 memory — the rules filter, extraction parsing, merge (dedupe / update /
 * remove / cap), the context block. Pure, synthetic data.
 */
import { describe, expect, it } from 'vitest';
import { factRejection } from '../rules';
import { applyExtraction, parseStoredFacts, sameFact } from '../merge';
import { buildExtractUserContent, parseExtraction } from '../extract-prompt';
import { renderMemoryBlock } from '../inject';
import { MEMORY_MAX_FACTS, type MemoryFact } from '../types';

const fact = (id: string, over: Partial<MemoryFact> = {}): MemoryFact => ({
  id,
  category: 'injury',
  text: 'כואבת לו הברך השמאלית בריצה',
  sourceMsgIds: ['a'],
  confidence: 0.9,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('rules: what Kelly may remember', () => {
  it('keeps the four fitness categories in Hebrew', () => {
    expect(factRejection({ category: 'injury', text: 'כואבת לו הברך השמאלית בריצה', confidence: 0.9 })).toBeNull();
    expect(factRejection({ category: 'schedule', text: 'עובד במשמרות, פנוי רק בבקרים', confidence: 0.8 })).toBeNull();
    expect(factRejection({ category: 'goal', text: 'יש לו גיבוש בחודש הבא', confidence: 0.8 })).toBeNull();
    expect(factRejection({ category: 'preference', text: 'לא אוהב ריצה', confidence: 0.7 })).toBeNull();
    expect(factRejection({ category: 'preference', text: 'מעדיף להתאמן בערבים', confidence: 0.7 })).toBeNull();
    expect(factRejection({ category: 'preference', text: 'אוהב אימוני רחוב וכדורגל', confidence: 0.7 })).toBeNull();
  });
  it.each([
    ['category', { category: 'religion', text: 'שומר מסורת', confidence: 0.9 }],
    ['low_confidence', { category: 'goal', text: 'אולי ירוץ מרתון', confidence: 0.4 }],
    ['not_hebrew', { category: 'goal', text: 'run a marathon', confidence: 0.9 }],
    ['too_long', { category: 'goal', text: 'א'.repeat(121), confidence: 0.9 }],
    ['sensitive', { category: 'injury', text: 'לוקח תרופות נגד דיכאון', confidence: 0.9 }],
    ['sensitive', { category: 'schedule', text: 'מתפלל כל בוקר בבית כנסת', confidence: 0.9 }],
    ['sensitive', { category: 'goal', text: 'בהריון, רוצה לשמור על כושר', confidence: 0.9 }],
    ['sensitive', { category: 'schedule', text: 'הטלפון שלו 050', confidence: 0.9 }],
    ['diagnosis', { category: 'injury', text: 'אובחן עם פריצת דיסק', confidence: 0.9 }],
  ])('drops %s', (why, f) => {
    expect(factRejection(f)).toBe(why);
  });
});

describe('extraction answer parsing', () => {
  it('parses ops, drops source ids that were not in the batch, tolerates prose around JSON', () => {
    const ops = parseExtraction('הנה:\n{"add":[{"category":"goal","text":"גיבוש בחודש הבא","confidence":0.9,"sourceMsgIds":["m1","fake"]}],"update":[],"remove":[]}', ['m1']);
    expect(ops?.add[0]).toMatchObject({ category: 'goal', sourceMsgIds: ['m1'] });
  });
  it('null on garbage or a wrong shape', () => {
    expect(parseExtraction('no json', ['m1'])).toBeNull();
    expect(parseExtraction('{"add":[{"category":"politics","text":"x","confidence":1}]}', ['m1'])).toBeNull();
  });
  it('the prompt content lists memory with ids and the new messages', () => {
    const c = buildExtractUserContent([fact('m_1')], [{ id: 'x1', text: 'יש לי גיבוש בעוד חודש' }]);
    expect(c).toContain('m_1 [injury]');
    expect(c).toContain('x1: יש לי גיבוש בעוד חודש');
  });
});

describe('merge', () => {
  it('adds, de-duplicates a repeat, updates in place, removes on request', () => {
    const start = [fact('m_knee')];
    const added = applyExtraction(start, { add: [{ category: 'injury', text: 'כואבת לו הברך השמאלית בריצה', confidence: 0.95, sourceMsgIds: ['b'] }, { category: 'goal', text: 'גיבוש בחודש הבא', confidence: 0.9, sourceMsgIds: ['c'] }], update: [], remove: [] }, 10);
    expect(added).toHaveLength(2);
    expect(added[0]).toMatchObject({ id: 'm_knee', confidence: 0.95, sourceMsgIds: ['a', 'b'] });
    const updated = applyExtraction(added, { add: [], update: [{ id: 'm_knee', text: 'הברך כבר כמעט לא כואבת', confidence: 0.8, sourceMsgIds: ['d'] }], remove: [] }, 20);
    expect(updated[0]).toMatchObject({ id: 'm_knee', text: 'הברך כבר כמעט לא כואבת', createdAt: 1, updatedAt: 20 });
    const removed = applyExtraction(updated, { add: [], update: [], remove: ['m_knee'] }, 30);
    expect(removed.map((f) => f.category)).toEqual(['goal']);
  });
  it('a sensitive add is filtered even if the model sends it', () => {
    expect(applyExtraction([], { add: [{ category: 'injury', text: 'מטופל אצל פסיכיאטר', confidence: 0.99, sourceMsgIds: [] }], update: [], remove: [] }, 1)).toEqual([]);
  });
  it('caps at 20, dropping the least confident first', () => {
    const many = Array.from({ length: MEMORY_MAX_FACTS }, (_, k) => fact(`m_${k}`, { category: 'preference', text: `העדפה מספר ${'א'.repeat(k + 1)}`, confidence: 0.7 + k * 0.01 }));
    const out = applyExtraction(many, { add: [{ category: 'goal', text: 'רוצה לרוץ חמישה קילומטר', confidence: 0.99, sourceMsgIds: [] }], update: [], remove: [] }, 5);
    expect(out).toHaveLength(MEMORY_MAX_FACTS);
    expect(out.some((f) => f.id === 'm_0')).toBe(false);
    expect(out.some((f) => f.category === 'goal')).toBe(true);
  });
  it('sameFact: same category and mostly the same words', () => {
    expect(sameFact({ category: 'preference', text: 'לא אוהב ריצה' }, { category: 'preference', text: 'לא אוהב ריצה בכלל' })).toBe(true);
    expect(sameFact({ category: 'preference', text: 'לא אוהב ריצה' }, { category: 'goal', text: 'לא אוהב ריצה' })).toBe(false);
  });
  it('stored docs are re-validated on read', () => {
    expect(parseStoredFacts([fact('m_1'), { id: 'x', text: 'לוקח ריטלין', category: 'injury' }, 'junk'])).toHaveLength(1);
  });
});

describe('the "מה אני זוכר עליך" block', () => {
  it('null without facts (flag on, nothing remembered = the old prompt)', () => {
    expect(renderMemoryBlock([])).toBeNull();
  });
  it('injury first, with the use-it-only-when-relevant rule', () => {
    const b = renderMemoryBlock([{ category: 'preference', text: 'לא אוהב ריצה' }, { category: 'injury', text: 'כואבת לו הברך' }])!;
    expect(b.split('\n')[1]).toBe('- פציעה או רגישות: כואבת לו הברך');
    expect(b).toContain('מה קלי זוכר');
    expect(b).toContain('Use a remembered fact only when it matters');
  });
});

describe('session context parity', () => {
  it('no memory (flag off or nothing remembered) = the exact prompt as before; with memory the block is appended', async () => {
    const { buildSessionContext } = await import('../../persona');
    const base = { firstName: 'דני', gender: 'male' as const, todayKey: '2026-10-20', israelDayOfWeek: 2, israelHour: 9 };
    const before = buildSessionContext(base);
    expect(buildSessionContext({ ...base, memory: null })).toBe(before);
    expect(buildSessionContext({ ...base, memory: undefined })).toBe(before);
    const block = renderMemoryBlock([{ category: 'preference', text: 'לא אוהב ריצה' }])!;
    const withMem = buildSessionContext({ ...base, memory: block });
    expect(withMem.startsWith(before)).toBe(true);
    expect(withMem).toContain('- העדפה: לא אוהב ריצה');
  });
});
