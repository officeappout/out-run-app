/**
 * i18n wave 2 batch x (namespace `community`): the league boards' keys —
 * `leagues.individual.*` (NeighborhoodLeaderboard), `leagues.sheets.*` (LeagueBoardSheets),
 * `leagues.scopes.*` (ScopeCompetitionLeaderboard), `leagues.battle.*` (ScopeBattleCard),
 * `leagues.national.*` (NationalLeagueBoard), `leagues.groupBoard.*` (GroupLeaderboard).
 * Every key must render exactly the literal / template the component had before the extraction
 * (copied verbatim below), including branches a static render can't reach and counts ≥ 1000.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/community.json';
import { community } from '@/messages/ns/community';
import { makeT } from '../t';
import { LEAGUE_COPY, LEAGUE_COPY_KEYS } from '@/features/arena/components/league-gender-copy';

const t = makeT('he', community);
type Key = keyof typeof he;
const GENDERS = ['male', 'female', 'other'] as const;
const WINDOWS = ['daily', 'weekly', 'monthly'] as const;
const pick = (g: string, m: string, f: string, o: string) => (g === 'female' ? f : g === 'male' ? m : o);
// The old `${n} פעיל${n !== 1 ? 'ים' : ''}`.
const oldActive = (n: number) => `${n} פעיל${n !== 1 ? 'ים' : ''}`;

const PREFIX_COUNTS: Array<[string, number]> = [
  ['leagues.individual.', 48],
  ['leagues.sheets.', 29],
  ['leagues.scopes.', 31],
  ['leagues.battle.', 13],
  ['leagues.national.', 40],
  ['leagues.groupBoard.', 10],
];

describe('community (he) leagues batch x — byte-identical to the pre-extraction literals', () => {
  it.each(PREFIX_COUNTS)('owns exactly the keys this test pins: %s', (prefix, n) => {
    expect(Object.keys(he).filter((k) => k.startsWith(prefix)).length).toBe(n);
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      // individuals board
      ['leagues.individual.category.general', 'כללי'],
      ['leagues.individual.category.running', 'ריצה'],
      ['leagues.individual.category.strength', 'כוח'],
      ['leagues.individual.category.steps', 'צעדים'],
      ['leagues.individual.category.distance', 'מרחק'],
      ['leagues.individual.time.daily', 'יומי'],
      ['leagues.individual.time.weekly', 'שבועי'],
      ['leagues.individual.time.monthly', 'חודשי'],
      ['leagues.individual.context.general', 'ימי אימון ברצף'],
      ['leagues.individual.context.steps', 'ממוצע יומי שבועי'],
      ['leagues.individual.context.distance', 'סה"כ ק"מ'],
      ['leagues.individual.context.strength', 'רמה ואחוז השלמה'],
      ['leagues.individual.leagueFallback', 'הליגה'],
      ['leagues.individual.me', '(אני)'],
      ['leagues.individual.subtitleFallback', 'טבלת דירוג'],
      ['leagues.individual.howPoints', 'איך צוברים נקודות'],
      ['leagues.individual.refresh', 'רענון'],
      ['leagues.individual.comingSoon', 'בקרוב'],
      ['leagues.individual.filters', 'פילטרים'],
      ['leagues.individual.hero.share', 'שיתוף המיקום שלי'],
      ['leagues.individual.hero.invite', 'הזמנת חברים'],
      ['leagues.individual.empty.body', 'היו הראשונים בליגה! הזמינו חברים והתחילו להתאמן כדי לתפוס את הפודיום'],
      ['leagues.individual.empty.cta', 'הזמנת חברים לליגה'],
      ['leagues.individual.locked.title', 'הטבלה נעולה'],
      ['leagues.individual.locked.cta', 'הזמנת שותף'],
      ['leagues.individual.expand.less', 'להציג פחות'],
      ['leagues.individual.sparse.title', 'הליגה רק מתחילה'],
      ['leagues.individual.sparse.ctaLabel', 'הזמנת חברים לליגה'],
      ['leagues.individual.sparse.cta', 'הזמנה'],
      ['leagues.individual.peekTitle', 'פרטי המשתתף'],
      // sheets
      ['leagues.sheets.close', 'סגור'],
      ['leagues.sheets.peek.me', '(את/ה)'],
      ['leagues.sheets.peek.score', 'ניקוד בטבלה'],
      ['leagues.sheets.peek.workoutsUnit', 'אימונים'],
      ['leagues.sheets.peek.period', 'בתקופה'],
      ['leagues.sheets.peek.daysUnit', 'ימים'],
      ['leagues.sheets.peek.streak', 'הרצף שלך'],
      ['leagues.sheets.peek.invite', 'הזמנת חברים לליגה'],
      ['leagues.sheets.how.steps.title', 'צעדים'],
      ['leagues.sheets.how.steps.body', 'ממוצע הצעדים היומי שלך ב-7 הימים האחרונים.'],
      ['leagues.sheets.how.distance.title', 'מרחק'],
      ['leagues.sheets.how.distance.body', 'סך הקילומטרים מאימוני ריצה והליכה שתיעדת בתקופה שנבחרה (יומי, שבועי או חודשי).'],
      ['leagues.sheets.how.scopes.title', 'קבוצות, שכונות וערים'],
      ['leagues.sheets.how.scopes.body', 'נקודות פעילות: כל דקת אימון כוח שווה 2 נקודות, וכל דקת אימון אירובי או תחזוקה שווה נקודה אחת. קבוצות מדורגות לפי ממוצע לחבר פעיל; שכונות וערים — לפי סכום הנקודות של כל החברים.'],
      ['leagues.sheets.xpNote', 'נקודות XP ורמות לא נספרות בדירוג הליגה.'],
      ['leagues.sheets.scope.workouts.title', 'אימונים'],
      ['leagues.sheets.scope.workouts.body', 'כל דקת אימון כוח שווה 2 נקודות. כל דקת ריצה, הליכה, רכיבה או אימון תחזוקה שווה נקודה אחת.'],
      ['leagues.sheets.scope.steps.title', 'צעדים'],
      ['leagues.sheets.scope.steps.body', 'כל 1,000 צעדים מלאים ביום שווים 3 נקודות (למשל 7,800 צעדים = 21 נקודות). הצעדים מתעדכנים פעם בשעה.'],
      ['leagues.sheets.scope.invite.title', 'חבר שמצטרף — 50+'],
      ['leagues.sheets.scope.invite.body', 'חבר שמצטרף דרך הקישור שלך מוסיף 50 נקודות לשכונה ולעיר שלך, עד 5 חברים בשבוע. הוא לא נספר כמשתתף פעיל עד שיתאמן.'],
      ['leagues.sheets.scope.order.title', 'איך מדרגים'],
      ['leagues.sheets.scope.order.body', 'הדירוג הרשמי הוא לפי ממוצע הנקודות למשתתף פעיל — כך גם שכונה או יישוב קטנים יכולים לנצח. השבוע מתחיל ביום ראשון, והחודש הוא החודש הקלנדרי.'],
      ['leagues.sheets.scope.kmNote', 'הק״מ שמוצגים ליד הנקודות הם בשביל הכיף — הם לא משפיעים על הנקודות או על הדירוג.'],
      // scopes board
      ['leagues.scopes.metric.points', 'נקודות'],
      ['leagues.scopes.metric.km', 'ק״מ'],
      ['leagues.scopes.loadError', 'שגיאה בטעינת הדירוג'],
      ['leagues.scopes.refresh', 'רענון'],
      ['leagues.scopes.category.overall', 'כל הפעילות'],
      ['leagues.scopes.category.strength', 'כוח'],
      ['leagues.scopes.category.cardio', 'אירובי'],
      ['leagues.scopes.filters', 'סינון'],
      ['leagues.scopes.filtersKm', 'ק״מ'],
      ['leagues.scopes.metricLabel', 'מדד'],
      ['leagues.scopes.categoryLabel', 'סוג פעילות'],
      ['leagues.scopes.noKm.title', 'עוד אין ק״מ בתקופה הזו'],
      ['leagues.scopes.noKm.body', 'הצעדים וההליכות מתעדכנים פעם בשעה.'],
      ['leagues.scopes.measureLabel', 'שיטת דירוג'],
      ['leagues.scopes.measure.avg', 'ממוצע למשתתף'],
      ['leagues.scopes.measure.total', 'סה״כ'],
      ['leagues.scopes.unit.km', 'ק״מ'],
      ['leagues.scopes.unit.kmPerMember', 'ק״מ למשתתף'],
      ['leagues.scopes.note.km', 'הק״מ מוצגים בשביל הכיף — הם לא משנים את הנקודות או את הדירוג הרשמי.'],
      ['leagues.scopes.note.avg', 'בממוצע למשתתף פעיל גודל השכונה לא קובע — גם קבוצה קטנה יכולה לנצח.'],
      ['leagues.scopes.note.total', 'בסה״כ הגדולים מובילים. הדירוג הרשמי הוא לפי ממוצע למשתתף.'],
      // battle card
      ['leagues.battle.groupWalk', 'יוצאים להליכה קבוצתית'],
      ['leagues.battle.title', 'קרב השבוע'],
      ['leagues.battle.invite', 'הזמנת חברים'],
      ['leagues.battle.switch', 'החלף יריבה'],
      ['leagues.battle.versus', 'נגד'],
      // national board
      ['leagues.national.metric.points', 'נקודות'],
      ['leagues.national.metric.km', 'ק״מ'],
      ['leagues.national.type.all', 'כל היישובים'],
      ['leagues.national.type.city', 'ערים'],
      ['leagues.national.type.council', 'מועצות'],
      ['leagues.national.type.settlement', 'קיבוצים ומושבים'],
      ['leagues.national.allRegions', 'כל האזורים'],
      ['leagues.national.metricLabel', 'מדד'],
      ['leagues.national.typeLabel', 'סוג יישוב'],
      ['leagues.national.regionLabel', 'אזור'],
      ['leagues.national.loadError', 'שגיאה בטעינת הדירוג'],
      ['leagues.national.refresh', 'רענון'],
      ['leagues.national.filtersKm', 'ק״מ'],
      ['leagues.national.filters', 'סינון'],
      ['leagues.national.measureLabel', 'שיטת דירוג'],
      ['leagues.national.measure.avg', 'ממוצע'],
      ['leagues.national.measure.total', 'סה״כ'],
      ['leagues.national.measure.improved', 'הכי משתפרים'],
      ['leagues.national.unavailable.title', 'הדירוג הזה נפתח בקרוב'],
      ['leagues.national.unavailable.body', 'הוא נבנה מהאימונים עצמם — עוד רגע הוא כאן.'],
      ['leagues.national.empty.kmTitle', 'עוד אין ק״מ בתקופה הזו'],
      ['leagues.national.empty.improvedTitle', 'עוד אין שיפור לעומת התקופה הקודמת'],
      ['leagues.national.empty.title', 'עוד אין פעילות בתקופה הזו'],
      ['leagues.national.empty.kmBody', 'הצעדים וההליכות מתעדכנים פעם בשעה.'],
      ['leagues.national.empty.body', 'כל אימון שנרשם מכניס את היישוב שלך לטבלה.'],
      ['leagues.national.mine', 'שלך'],
      ['leagues.national.unit.km', 'ק״מ'],
      ['leagues.national.unit.kmPerMember', 'ק״מ למשתתף'],
      ['leagues.national.note.km', 'הק״מ מוצגים בשביל הכיף — הם לא משנים את הנקודות או את הדירוג הרשמי.'],
      ['leagues.national.note.avg', 'בממוצע למשתתף פעיל הגודל לא קובע — גם יישוב קטן יכול לנצח.'],
      ['leagues.national.note.improved', 'מי הוסיף הכי הרבה לעומת התקופה הקודמת.'],
      ['leagues.national.note.total', 'בסה״כ הגדולים מובילים. הדירוג הרשמי הוא לפי ממוצע למשתתף.'],
      // groups board
      ['leagues.groupBoard.title', 'דירוג הקבוצות'],
      ['leagues.groupBoard.refresh', 'רענון'],
      ['leagues.groupBoard.loadError', 'שגיאה בטעינת הדירוג'],
      ['leagues.groupBoard.empty.title', 'אין עדיין קבוצות בתחרות'],
      ['leagues.groupBoard.empty.body', 'כשחברי קהילה יסיימו אימונים כחלק מקבוצה, היא תופיע כאן'],
      ['leagues.groupBoard.unit', 'ממוצע'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('individuals board: values and branches', () => {
    // getContextLabel's running branches + strength with a program name.
    const runOld = (seg: string) =>
      seg === '3k' ? 'שיא קצב ל-3 ק"מ' : seg === '5k' ? 'שיא קצב ל-5 ק"מ' : seg === '10k' ? 'שיא קצב ל-10 ק"מ' : 'סה"כ ק"מ שבועי';
    for (const seg of ['all', '3k', '5k', '10k']) expect(t('leagues.individual.context.running', { segment: seg })).toBe(runOld(seg));
    expect(t('leagues.individual.context.strengthProgram', { program: 'מתח' })).toBe(`רמה ואחוז השלמה — ${'מתח'}`);

    const phrase = (w: string) => (w === 'daily' ? 'היום' : w === 'weekly' ? 'השבוע' : 'החודש');
    for (const w of WINDOWS) {
      expect(t('leagues.individual.windowPhrase', { window: w })).toBe(phrase(w));
      for (const name of ['תל אביב', 'הליגה']) {
        expect(t('leagues.individual.share.rank', { rank: String(1234), name, window: phrase(w) })).toBe(`אני במקום #${1234} ב${name} ${phrase(w)} על Out! 🔥`);
        expect(t('leagues.individual.hero.position', { window: phrase(w), name })).toBe(`המיקום שלך ${phrase(w)} · ${name}`);
      }
    }
    expect(t('leagues.individual.share.invite', { name: 'הליגה' })).toBe(`בואו להצטרף אליי ב${'הליגה'} על Out! 🔥`);
    expect(t('leagues.individual.workouts', { count: String(1500) })).toBe(`${1500} אימונים`);
    expect(t('leagues.individual.title', { global: 'yes' })).toBe('דירוג ארצי');
    expect(t('leagues.individual.title', { global: 'no' })).toBe('ליגת העיר');
    for (const scope of ['tenant', 'city', 'reserve', 'global'])
      expect(t('leagues.individual.badge', { scope })).toBe(scope === 'tenant' ? 'ימים פעילים' : 'רצף');
    expect(t('leagues.individual.hero.of', { count: String(1234) })).toBe(`מתוך ${1234}`);
    expect(t('leagues.individual.hero.streak', { days: String(1001) })).toBe(`${1001} ימי אימון ברצף`);
    expect(t('leagues.individual.expand.all', { count: String(1200) })).toBe(`להציג את כל ${1200} המשתתפים`);
    for (const n of [1, 2, 4, 1234])
      expect(t('leagues.individual.sparse.body', { n, count: String(n) })).toBe(
        `${n === 1 ? 'משתתף אחד עד עכשיו' : `רק ${n} משתתפים עד עכשיו`} — הזמינו חברים להתחרות איתכם`,
      );
  });

  it('individuals board: gendered copy equals the gender batch 2 table', () => {
    const OLD = {
      stepTrain: { male: 'אמן כאן את האימון הראשון', female: 'אמני כאן את האימון הראשון', other: 'אימון ראשון כאן' },
      stepInvite: { male: 'הזמן שותף לליגה', female: 'הזמיני שותף לליגה', other: 'מזמינים שותף לליגה' },
      stepPodium: { male: 'פתח את הליגה ותפוס את הפודיום', female: 'פתחי את הליגה ותפסי את הפודיום', other: 'פותחים את הליגה ותופסים את הפודיום' },
      lockedInvite: { male: 'הזמן שותף אחד כדי לפתוח את הטבלה המלאה', female: 'הזמיני שותף אחד כדי לפתוח את הטבלה המלאה', other: 'עוד שותף אחד, והטבלה המלאה נפתחת' },
      lockedCity: { male: 'לחץ על העירייה כדי לפתוח את הליגה הרשמית', female: 'לחצי על העירייה כדי לפתוח את הליגה הרשמית', other: 'לוחצים על העירייה כדי לפתוח את הליגה הרשמית' },
    } as const;
    for (const id of Object.keys(OLD) as Array<keyof typeof OLD>) {
      for (const g of GENDERS) {
        expect(t(LEAGUE_COPY_KEYS[id], { gender: g }), `${id}/${g}`).toBe(OLD[id][g]);
        expect(LEAGUE_COPY[id][g]).toBe(OLD[id][g]);
      }
    }
  });

  it('sheets: values and branches', () => {
    expect(t('leagues.sheets.peek.rank', { rank: String(1234) })).toBe(`מקום ${1234}`);
    expect(t('leagues.sheets.peek.of', { count: String(1234) })).toBe(`מתוך ${1234}`);
    for (const gap of [5, -5, 0])
      expect(t('leagues.sheets.peek.gap', { dir: gap > 0 ? 'ahead' : gap < 0 ? 'behind' : 'tie' })).toBe(gap > 0 ? 'לפניך' : gap < 0 ? 'אחריך' : 'שוויון');
    for (const isTenant of [true, false]) {
      const tenant = isTenant ? 'yes' : 'no';
      expect(t('leagues.sheets.how.general.title', { tenant })).toBe(isTenant ? 'כללי — ימים פעילים' : 'כללי — רצף ימי אימון');
      expect(t('leagues.sheets.how.general.body', { tenant })).toBe(
        isTenant
          ? 'בליגת הארגון סופרים את מספר הימים שבהם התאמנת.'
          : 'כל יום שבו צברת לפחות 10 דקות פעילות מוסיף יום לרצף. יום בלי פעילות מאפס את הרצף.',
      );
    }
  });

  it('retry buttons = GENDERED_COPY.retry', () => {
    for (const key of ['leagues.scopes.retry', 'leagues.national.retry', 'leagues.groupBoard.retry'] as const)
      for (const g of GENDERS) expect(t(key, { gender: g })).toBe(pick(g, 'נסה שוב', 'נסי שוב', 'נסו שוב'));
  });

  it('scopes / national / groups: active counts, units, windows', () => {
    for (const key of ['leagues.scopes.active', 'leagues.national.active', 'leagues.groupBoard.active'] as const)
      for (const n of [0, 1, 2, 1234]) expect(t(key, { n, count: String(n) })).toBe(oldActive(n));

    const gran = { city: 'ערים', neighborhood: 'שכונות' } as const;
    const empty = {
      city: { title: 'אין עדיין תחרות בין ערים', subtitle: 'כשמשתמשים בערים שונות יסיימו אימונים, הן יופיעו כאן בדירוג' },
      neighborhood: { title: 'אין עדיין תחרות בין שכונות', subtitle: 'הדירוג הזה יתמלא ככל שיותר משתמשים יבחרו שכונה בפרופיל שלהם' },
    } as const;
    const w3 = (w: string) => (w === 'daily' ? 'יומי' : w === 'weekly' ? 'שבועי' : 'חודשי');
    for (const granularity of ['city', 'neighborhood'] as const) {
      expect(t('leagues.scopes.title', { granularity })).toBe(`דירוג ה${gran[granularity]}`);
      expect(t('leagues.scopes.empty.title', { granularity })).toBe(empty[granularity].title);
      expect(t('leagues.scopes.empty.body', { granularity })).toBe(empty[granularity].subtitle);
      for (const w of WINDOWS) expect(t('leagues.scopes.subtitle', { granularity, window: w })).toBe(`${gran[granularity]} • ${w3(w)}`);
    }
    for (const w of WINDOWS) expect(t('leagues.groupBoard.subtitle', { window: w })).toBe(`קבוצות • ${w3(w)}`);

    const unit = "נק' פעילות";
    expect(t('leagues.scopes.unit.perMember', { unit })).toBe(`${unit} למשתתף`);
    expect(t('leagues.national.unit.perMember', { unit })).toBe(`${unit} למשתתף`);
    expect(t('leagues.scopes.km', { km: '1,240.5' })).toBe(`${'1,240.5'} ק״מ`);
    expect(t('leagues.national.km', { km: '1,240.5' })).toBe(`${'1,240.5'} ק״מ`);
    expect(t('leagues.scopes.podium.sub', { count: String(1234) })).toBe(`${1234} פעילים`);
    expect(t('leagues.scopes.podium.subKm', { count: String(1234), km: '12.5' })).toBe(`${1234} פעילים · ${'12.5'} ק״מ`);
    expect(t('leagues.national.podiumSub', { count: String(1234) })).toBe(`${1234} פעילים`);
    expect(t('leagues.groupBoard.podiumSub', { count: String(1234) })).toBe(`${1234} פעילים`);

    for (const w of WINDOWS) {
      expect(t('leagues.national.window', { window: w })).toBe(w === 'weekly' ? 'השבוע' : w === 'monthly' ? 'החודש' : 'היום');
      expect(t('leagues.national.unit.improved', { unit, window: w })).toBe(`${unit} מול ${w === 'monthly' ? 'החודש הקודם' : 'שבוע שעבר'}`);
    }
    for (const mode of ['settlements', 'neighborhoods'])
      expect(t('leagues.national.title', { mode })).toBe(mode === 'neighborhoods' ? 'השכונות בכל הארץ' : 'ליגת היישובים');
  });

  it('battle card: values', () => {
    const name = 'הצפון הישן';
    expect(t('leagues.battle.inviteText', { name })).toBe(`בואו להצטרף אליי ב${name} על Out! 🔥`);
    expect(t('leagues.battle.noOpponent', { name })).toBe(`עדיין אין יריב ל${name}`);
    expect(t('leagues.battle.active', { count: String(1234) })).toBe(`${1234} פעילים`);
    expect(t('leagues.battle.perMember', { unit: "נק' כוח" })).toBe(`${"נק' כוח"} בממוצע למשתתף פעיל`);
    expect(t('leagues.battle.km', { km: '1,240.4' })).toBe(` · ${'1,240.4'} ק״מ`);
    expect(t('leagues.battle.total', { unit: "נק' ריצה", name })).toBe(`סה״כ ${"נק' ריצה"} · ${name}`);
    expect(t('leagues.battle.leading', { gap: '1,135', name })).toBe(`מובילים ב־${'1,135'} למשתתף על ${name}`);
    expect(t('leagues.battle.trailing', { gap: '1,135', name })).toBe(`רק ${'1,135'} למשתתף מ${name}!`);
  });
});
