/**
 * i18n wave 2 batch w — namespace `coach` (Kelly / "קלי AI": src/features/ai-coach, app/ai-coach).
 * Every key renders the old literal / template of origin/main verbatim, including what a static
 * render can't reach (taps, effects) and every select branch. Old maps / helpers are re-declared
 * here exactly as they were.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/coach.json';
import { coach } from '@/messages/ns/coach';
import { RATING_LABEL_HE } from '@/lib/ai/coach/proactive/feedback';
import { makeT } from '../t';

const t = makeT('he', coach);
type Key = keyof typeof he;

const PLAIN: Array<[Key, string]> = [
  ['page.loading', 'טוען...'],
  ['page.noAccess.title', 'קלי AI עוד לא פתוח כאן'],
  ['page.noAccess.body', 'כשקלי AI ייפתח לחשבון הזה, הוא יופיע בהודעות ובמסך הבית.'],
  ['page.noAccess.back', 'חזרה לבית'],
  ['chat.backAria', 'חזור'],
  ['chat.unified.title', 'קלי'],
  ['chat.unified.badge', 'AI + צוות'],
  ['chat.unified.subtitleTeam', 'הצוות של OUT עונה כאן'],
  ['chat.unified.subtitleAi', 'רוב התשובות נכתבות על ידי AI. הודעות מהצוות מסומנות'],
  ['chat.classic.title', 'קלי AI'],
  ['chat.classic.subtitle', 'מאמן דיגיטלי. התשובות נכתבות על ידי בינה מלאכותית'],
  ['chat.memoryButton', 'מה קלי זוכר'],
  ['chat.offline.text', 'אין חיבור. בונה האימונים עובד גם בלי אינטרנט.'],
  ['chat.offline.builder', 'לבונה האימונים'],
  ['chat.loading', 'טוען את השיחה...'],
  ['chat.teamNote', 'הצוות יענה כאן. אפשר לכתוב כל שאלה על האימונים או על האפליקציה.'],
  ['chat.status.checking', 'בודק...'],
  ['chat.status.typing', 'קלי כותב...'],
  ['chat.missingCard', 'האימון הזה כבר לא שמור במכשיר. אפשר לבקש מקלי לבנות אותו שוב.'],
  ['chat.error.retry', 'לנסות שוב'],
  ['chat.error.builder', 'לבונה האימונים'],
  ['chat.error.close', 'סגירה'],
  ['chat.input.placeholder', 'כתבו לקלי...'],
  ['chat.input.placeholderTeam', 'כתבו לצוות...'],
  ['chat.sendAria', 'שליחה'],
  ['entry.inbox.title', 'קלי AI'],
  ['entry.inbox.subtitle', 'מאמן דיגיטלי. אימון, התקדמות ותוכנית השבוע'],
  ['entry.home.aria', 'פתח את קלי AI'],
  ['entry.home.subtitle', 'אימון להיום, התקדמות ותוכנית השבוע'],
  ['entry.kelly.title', 'קלי'],
  ['entry.kelly.badge', 'המאמן שלך'],
  ['entry.kelly.previewFallback', 'אימונים, תוכנית השבוע ושאלות על האפליקציה'],
  ['memory.title', 'מה קלי זוכר'],
  ['memory.closeAria', 'סגור'],
  ['memory.intro', 'דברים שסיפרת לקלי בשיחות ושעוזרים לו להתאים לך אימונים: פציעות, לו״ז, יעדים והעדפות. אפשר למחוק כל אחד מהם.'],
  ['memory.loading', 'טוען...'],
  ['memory.failed', 'לא הצלחנו לטעון כרגע. נסו שוב בעוד רגע.'],
  ['memory.empty.title', 'קלי עוד לא זוכר שום דבר.'],
  [
    'memory.empty.explainer',
    'הזיכרון מתעדכן פעם בלילה, ממה שמספרים לקלי בשיחה על פציעות, לו״ז, יעדים והעדפות. את התוכנית, הרמות וימי האימון קלי רואה ישר מהאפליקציה, ולכן הם לא מופיעים כאן.',
  ],
  ['memory.deleteAria', 'מחק'],
  ['memory.deleteAll.question', 'למחוק את כל מה שקלי זוכר?'],
  ['memory.deleteAll.cancel', 'ביטול'],
  ['memory.deleteAll.confirm', 'מחק הכל'],
  ['memory.deleteAll.open', 'מחק הכל'],
  ['proposal.saved', 'נשמר בלו״ז'],
  ['proposal.dismissed', 'בוטל. הלו״ז נשאר כמו שהיה.'],
  ['proposal.hint', 'שום דבר לא משתנה עד שמאשרים.'],
  ['proposal.confirm', 'אשר'],
  ['proposal.dismiss', 'בטל'],
  ['card.tag', 'קלי AI'],
  ['card.open', 'פתח אימון'],
  ['card.building', 'בונה לך אימון…'],
  ['card.failed.title', 'לא הצלחתי לבנות את האימון'],
  ['card.failed.body', 'אפשר לנסות שוב או לבנות בבונה האימונים.'],
  ['card.failed.retry', 'לנסות שוב'],
  ['card.failed.builder', 'לבונה האימונים'],
  ['card.view.titleFallback', 'אימון מותאם'],
  ['card.view.location.home', 'בבית'],
  ['card.view.location.park', 'בפארק'],
  ['card.view.location.office', 'במשרד'],
  ['card.view.location.street', 'בחוץ'],
  ['card.view.difficulty.easy', 'קל'],
  ['card.view.difficulty.medium', 'בינוני'],
  ['card.view.difficulty.hard', 'מאתגר'],
  ['card.view.openAria', 'פתח אימון'],
  ['aerobic.kind.walk', 'הליכה'],
  ['aerobic.kind.easyRun', 'לפי תחושה'],
  ['aerobic.kind.programRun', 'מהתוכנית'],
  ['aerobic.stops', 'תחנות כוח'],
  ['aerobic.route.map', 'מסלול במפה'],
  ['aerobic.cta.walk', 'פתח הליכה במפה'],
  ['aerobic.cta.run', 'פתח ריצה במפה'],
];

// Keys checked in the "values and branches" block below.
const WITH_VALUES: Key[] = [
  'chat.rated',
  'entry.ask',
  'proposal.note',
  'card.view.minutes',
  'card.view.exercises',
  'card.view.difficultyAria',
  'aerobic.km',
  'aerobic.minutes',
  'aerobic.route.found',
  'parks.aria',
  'parks.ariaEquipment',
  'parks.line',
  'parks.lineEquipment',
];

describe('coach (Kelly) — he', () => {
  it('plain strings = the old literals', () => {
    for (const [key, old] of PLAIN) expect(t(key), key).toBe(old);
  });

  it('every key of the batch is covered (counted per prefix: page / chat / entry / memory / proposal / card / aerobic / parks)', () => {
    const prefixes = ['page.', 'chat.', 'entry.', 'memory.', 'proposal.', 'card.', 'aerobic.', 'parks.'];
    const batchKeys = (Object.keys(he) as Key[]).filter((k) => prefixes.some((p) => k.startsWith(p)));
    const covered = new Set<Key>([...PLAIN.map(([k]) => k), ...WITH_VALUES]);
    expect(batchKeys.filter((k) => !covered.has(k))).toEqual([]);
    expect(batchKeys.length).toBe(PLAIN.length + WITH_VALUES.length);
  });

  it('values and branches = the old templates / maps', () => {
    // chat rating line (RATING_LABEL_HE from src/lib, unchanged)
    for (const rating of ['easy', 'right', 'hard'] as const)
      expect(t('chat.rated', { rating })).toBe(`ענית: ${RATING_LABEL_HE[rating]}. תודה, רשמתי.`);

    // home entry: the old ASK map, keyed by coachGenderOf() (male | female | other)
    const ASK = { male: 'שאל את קלי', female: 'שאלי את קלי', other: 'שאלו את קלי' } as const;
    for (const gender of ['male', 'female', 'other'] as const) expect(t('entry.ask', { gender })).toBe(ASK[gender]);

    // proposal note: NOTE[r] ?? NOTE.failed
    const NOTE: Record<string, string> = {
      stale: 'הלו״ז השתנה מאז שההצעה הוכנה, אז היא לא נשמרה. אפשר לבקש מקלי הצעה חדשה.',
      expired: 'ההצעה כבר לא בתוקף. אפשר לבקש מקלי הצעה חדשה.',
      busy: 'השמירה כבר בתהליך, עוד רגע.',
      failed: 'השמירה לא הצליחה. אפשר לנסות שוב.',
      offline: 'אין חיבור. אפשר לאשר כשהחיבור יחזור.',
    };
    for (const outcome of ['applied', 'dismissed', 'stale', 'expired', 'busy', 'failed', 'offline'])
      expect(t('proposal.note', { outcome })).toBe(NOTE[outcome] ?? NOTE.failed);

    // workout card view
    for (const n of [1, 2, 6, 1234]) {
      expect(t('card.view.minutes', { minutes: String(n) })).toBe(`${n} דק׳`);
      expect(t('card.view.exercises', { count: String(n) })).toBe(n === 1 ? 'תרגיל אחד' : `${n} תרגילים`);
    }
    for (const label of ['קל', 'בינוני', 'מאתגר']) expect(t('card.view.difficultyAria', { label })).toBe(`רמת קושי ${label}`);

    // aerobic card
    for (const v of [0.5, 3.25, 12, 1234]) {
      expect(t('aerobic.km', { km: String(v) })).toBe(`${v} ק״מ`);
      expect(t('aerobic.minutes', { minutes: String(v) })).toBe(`${v} דק׳`);
      expect(t('aerobic.route.found', { km: String(v) })).toBe(`מסלול ${v} ק״מ`);
    }

    // nearby parks: aria + line, with / without equipment
    const p = { name: 'גינת הכושר', distanceKm: 0.8, equipment: ['מתח', 'מקבילים'] };
    const oldAria = (x: typeof p) => `פתח במפה: ${x.name}, ${x.distanceKm} ק״מ${x.equipment.length ? `, ${x.equipment.join(', ')}` : ''}`;
    const oldLine = (x: typeof p) => `${x.distanceKm} ק״מ` + (x.equipment.length ? ` · ${x.equipment.join(', ')}` : '');
    expect(t('parks.ariaEquipment', { name: p.name, km: String(p.distanceKm), equipment: p.equipment.join(', ') })).toBe(oldAria(p));
    expect(t('parks.lineEquipment', { km: String(p.distanceKm), equipment: p.equipment.join(', ') })).toBe(oldLine(p));
    const bare = { ...p, distanceKm: 1234.5, equipment: [] };
    expect(t('parks.aria', { name: bare.name, km: String(bare.distanceKm) })).toBe(oldAria(bare));
    expect(t('parks.line', { km: String(bare.distanceKm) })).toBe(oldLine(bare));
  });
});
