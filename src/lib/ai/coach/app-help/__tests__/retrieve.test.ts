/**
 * Kelly phase 2 — app help retrieval: real user phrasings → the right entry; unknown → none.
 */
import { describe, it, expect } from 'vitest';
import { APP_HELP_ENTRIES } from '../entries';
import { GetAppHelpInput, appHelpToolResult, findAppHelp } from '../retrieve';

const top = (q: string) => findAppHelp({ query: q })[0]?.id ?? null;

describe('get_app_help retrieval', () => {
  it.each([
    ['איך מחברים את הצעדים?', 'steps'],
    ['הצעדים לא מתעדכנים לי מהשעון', 'steps'],
    ['איך מכבים התראות בשבת?', 'notifications'],
    ['יש יותר מדי התראות', 'notifications'],
    ['איך אני מוחק את החשבון', 'account'],
    ['איך מתנתקים?', 'account'],
    ['איך מחליפים תוכנית?', 'change_program'],
    ['אפשר להוסיף תוכנית ריצה?', 'change_program'],
    ['איך מזיזים אימון ליום אחר בלו״ז', 'schedule'],
    ['איפה עושים בדיקת רמה?', 'level_check'],
    ['איך מוצאים פארק קרוב?', 'parks_map'],
    ['מה זה מסלול עם עצירות?', 'hybrid'],
    ['איך מעדכנים את הציוד שלי', 'equipment'],
    ['מי רואה אותי במפה?', 'privacy'],
    ['אני רוצה לדבר עם בן אדם', 'team'],
    ['איך האפליקציה עובדת?', 'navigation'],
  ])('%s → %s', (q, id) => {
    expect(top(q)).toBe(id);
  });

  it('unrelated or unknown questions find nothing (→ offer the team)', () => {
    expect(findAppHelp({ query: 'מה מזג האוויר מחר בתל אביב' })).toEqual([]);
    const r = appHelpToolResult({ query: 'איך משנים את צבע האפליקציה לסגול' });
    expect(r.found).toBe(false);
    expect(String(r.noteForCoach)).toMatch(/handoff_to_human/);
  });

  it('a topic id wins; the input needs topic or query', () => {
    expect(findAppHelp({ topic: 'privacy' })[0].id).toBe('privacy');
    expect(GetAppHelpInput.safeParse({}).success).toBe(false);
    expect(GetAppHelpInput.safeParse({ topic: 'nope' }).success).toBe(false);
  });

  it('entries are well formed: unique ids, short Hebrew answers, no slashes for gender', () => {
    const ids = APP_HELP_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of APP_HELP_ENTRIES) {
      expect(e.answer.length).toBeLessThan(520);
      expect(e.keywords.length).toBeGreaterThan(2);
      expect(e.answer).not.toMatch(/[א-ת]\/[א-ת]/);
    }
  });
});
