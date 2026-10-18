/**
 * Owner review 18.10.2026 — the pure pieces behind the fixes: reply guards (grounding +
 * Hebrew only), the user-intent reader for generate_workout, request-derived titles, and
 * the narrowed safety gate (false positives included).
 */
import { describe, it, expect } from 'vitest';
import {
  checkReply,
  correctionNote,
  factsFromEvidence,
  findForeignWords,
  findUngroundedClaims,
  stripForeignWords,
} from '../reply-guards';
import { aiWorkoutTitle, applyUserIntent, inferBodyIntent, inferDifficulty, inferLocation, inferMinutes } from '../intent';
import { detectSafetyTrigger, safetyReply } from '../safety';
import { GenerateWorkoutInput } from '../tools';
import { renderSheet } from '../persona';
import { OWNER_SHEET } from './owner-sheet.fixture';

describe('reply guards — grounding', () => {
  // streakDays 2 would make "2" a known count; drop it so the count checks are sharp.
  const facts = factsFromEvidence({ ...OWNER_SHEET, streakDays: null }, [], 0);

  it('case 1: the invented week (three workouts, Sunday 15:00, Tuesday, Thursday) is flagged', () => {
    const bad = 'השבוע יש לך שלושה אימונים של גוף מלא: ביום ראשון ב-15:00, שלישי וחמישי.';
    const claims = findUngroundedClaims(bad, facts);
    expect(claims).toEqual(expect.arrayContaining(['time 15:00', '3 workouts', 'weekday שלישי', 'weekday חמישי']));
  });

  it('the true week passes', () => {
    const good = 'השבוע מתוכננים לך 4 אימונים: ביום ראשון ב-18:00, שני, רביעי ב-07:30 ושישי.';
    expect(findUngroundedClaims(good, facts)).toEqual([]);
    expect(checkReply(good, facts)).toEqual([]);
  });

  it('levels must come from the sheet', () => {
    expect(findUngroundedClaims('אתה ברמה 15 בגוף מלא', facts)).toEqual([]);
    expect(findUngroundedClaims('אתה ברמה 17 בגוף מלא', facts)).toEqual(['level 17']);
  });

  it('with no sheet and no tool result, any count or time is ungrounded', () => {
    const none = factsFromEvidence(null, [], 0);
    expect(findUngroundedClaims('יש לך 3 אימונים השבוע', none)).toEqual(['3 workouts']);
  });

  it('tool results count as evidence (get_schedule)', () => {
    const sched = JSON.stringify({ from: '2026-10-25', to: '2026-10-31', entries: [{ date: '2026-10-27', type: 'training', programs: [], startTime: '06:15', completed: false, title: null }] });
    const f = factsFromEvidence(null, [sched], 0);
    expect(findUngroundedClaims('בשבוע הבא יש לך אימון אחד, ביום שלישי ב-06:15.', f)).toEqual([]);
  });

  it('"שני אימונים" is a count, and a plain "ראשון" (first) is not a weekday claim', () => {
    expect(findUngroundedClaims('השבוע יש לך שני אימונים', facts)).toEqual(['2 workouts']);
    // A suggestion is not a claim about the user.
    expect(findUngroundedClaims('אפשר לעשות שלושה אימונים קצרים בשבוע', facts)).toEqual([]);
    expect(findUngroundedClaims('התרגיל הראשון בתוכנית הוא סקוואט', facts)).toEqual([]);
  });
});

describe('reply guards — Hebrew only', () => {
  it('case 1: "ביום suspicious..." is flagged and stripped', () => {
    const text = 'ביום suspicious... נכון יותר לבדוק.';
    expect(findForeignWords(text, '')).toEqual(['suspicious']);
    expect(stripForeignWords(text, ['suspicious'])).toBe('ביום... נכון יותר לבדוק.');
  });

  it('allows AI, protocol names, single letters and words found in the evidence', () => {
    expect(findForeignWords('קלי AI בנה לך EMOM של 10 דקות עם ישיבת L', '')).toEqual([]);
    expect(findForeignWords('תתחיל עם Tuck', '{"name":"פלאנץ׳ Tuck"}'.toLowerCase())).toEqual([]);
    expect(findForeignWords('ok bro', '')).toEqual(['ok', 'bro']);
  });

  it('correction note names the problem', () => {
    const note = correctionNote([{ kind: 'ungrounded', claims: ['time 15:00'] }, { kind: 'foreign', words: ['suspicious'] }]);
    expect(note).toContain('time 15:00');
    expect(note).toContain('suspicious');
    expect(note).toContain('get_schedule');
  });
});

describe('user sheet rendering', () => {
  it('counts the week for the model', () => {
    const r = renderSheet(OWNER_SHEET);
    expect(r).toContain('4 planned workouts');
    expect(r).toContain('יום ראשון 2026-10-18 18:00');
    expect(r).toContain('יום רביעי 2026-10-21 07:30');
  });
});

describe('intent — Hebrew body areas', () => {
  it.each([
    ['תבנה לי אימון בטן', ['core']],
    ['אימון ליבה קצר', ['core']],
    ['אימון רגליים וישבן', ['legs']],
    ['משהו לגב', ['pull']],
    ['אימון משיכה', ['pull']],
    ['חזה וכתפיים', ['push']],
    ['אימון ידיים', ['push']],
    ['יד קדמית', ['pull']],
    ['יד אחורית', ['push']],
    ['בטן ורגליים בבית', ['legs', 'core']],
    ['רגליים למתח', ['core']],
  ])('%s → %j', (text, domains) => {
    expect(inferBodyIntent(text).domains).toEqual(domains);
  });

  it('"גבוהה" is not "גב"; no area named → none', () => {
    expect(inferBodyIntent('אימון ברמה גבוהה לבית 10 דק').domains).toEqual([]);
    expect(inferBodyIntent('בוא תבנה לי אימון לבית ל10 דק').domains).toEqual([]);
    expect(inferBodyIntent('אימון לכל הגוף').fullBody).toBe(true);
  });

  it('location, minutes, intensity', () => {
    expect(inferLocation('בוא תבנה לי אימון לבית ל10 דק')).toBe('home');
    expect(inferLocation('אימון בפארק')).toBe('park');
    expect(inferMinutes('בוא תבנה לי אימון לבית ל10 דק')).toBe(10);
    expect(inferMinutes('אימון של 25 דקות')).toBe(25);
    expect(inferMinutes('אימון בטן')).toBeNull();
    expect(inferDifficulty('אימון ברמה גבוהה לבית 10 דק')).toBe(3);
    expect(inferDifficulty('משהו קליל')).toBe(1);
  });

  it('case 5: "תבנה לי אימון בטן" overrides a model input with no domains', () => {
    const model = GenerateWorkoutInput.parse({ durationMin: 20, location: 'home', difficulty: 2 });
    const r = applyUserIntent(model, 'תבנה לי אימון בטן');
    expect(r.input.domains).toEqual(['core']);
    expect(r.changes).toEqual(['domains:none→core']);
  });

  it('case 3 + 4: home and 10 minutes win over the model; "רמה גבוהה" → difficulty 3', () => {
    const model = GenerateWorkoutInput.parse({ durationMin: 20, location: 'park', difficulty: 2, equipment: ['bar'] });
    const r = applyUserIntent(model, 'אימון ברמה גבוהה לבית 10 דק');
    expect(r.input).toMatchObject({ location: 'home', durationMin: 10, difficulty: 3, equipment: [] });
  });

  it('skill domains survive when the text names no base area', () => {
    const model = GenerateWorkoutInput.parse({ durationMin: 30, location: 'park', difficulty: 2, domains: ['planche'] });
    expect(applyUserIntent(model, 'אימון פלאנץ׳').input.domains).toEqual(['planche']);
  });
});

describe('titles of AI-built workouts come from the request', () => {
  it.each([
    [['core'], 'home', 'אימון בטן בבית'],
    [[], 'home', 'אימון גוף מלא בבית'],
    [['legs', 'core'], 'park', 'אימון רגליים ובטן בפארק'],
    [['planche'], 'park', 'אימון כוח בפארק'],
  ] as const)('%j %s → %s', (domains, loc, title) => {
    expect(aiWorkoutTitle(domains, loc)).toBe(title);
  });

  it('never a persona or situation title', () => {
    expect(aiWorkoutTitle([], 'home')).not.toMatch(/שמירה|מילואים|משרד/);
  });
});

describe('safety gate — genuine symptoms only', () => {
  it.each([
    ['יש לי כאב בחזה כשאני רץ', 'chest'],
    ['כואב לי בחזה', 'chest'],
    ['מרגיש לחץ בחזה', 'chest'],
    ['קשה לי לנשום אחרי מדרגות', 'breath'],
    ['קצת מסוחרר היום', 'dizziness'],
    ['כמעט התעלפתי באימון אתמול', 'dizziness'],
    ['אני בהריון, אפשר אימון?', 'pregnancy'],
    ['נקעתי את הקרסול', 'injury'],
    ['יש לי כאב חד בברך', 'injury'],
  ])('%s → %s', (text, trigger) => {
    expect(detectSafetyTrigger(text)).toBe(trigger);
  });

  it.each([
    'כואבים לי השרירים',
    'יש לי כאבי שרירים מאתמול',
    'תגיד למה דוקטור הצעת 20 דק?',
    'דוקטור, אתה רופא של אימונים',
    'אין לי כאבים בחזה, סתם שאלה',
    'בלי סחרחורת, הכל טוב',
    'אשתי בהריון, אני רוצה אימון',
    'כואבים לי שרירי החזה מהשכיבות סמיכה',
    'אימון ברמה גבוהה לבית 10 דק',
    'תבנה לי אימון בטן',
  ])('no trigger: %s', (text) => {
    expect(detectSafetyTrigger(text)).toBeNull();
  });

  it('the fixed reply speaks as a man and addresses the user by their gender', () => {
    expect(safetyReply('chest', 'male')).toContain('אני לא רופא');
    expect(safetyReply('chest', 'male')).toContain('אני עוצר');
    expect(safetyReply('chest', 'female')).toContain('התקשרי');
    expect(safetyReply('injury', 'other')).toContain('צריך להתקשר');
  });
});
