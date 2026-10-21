/**
 * i18n wave 2 (namespace `onboarding`, keys `signup.*` / `whatNow.*` / `programPath.*`): every key the v2
 * signup sub-flows (running-v2, strength-v2, walking-v2, add-track), the what-now drawer and the v2
 * program-path screens use must render the Hebrew those components hard-coded before the extraction —
 * the old literal / template copied verbatim, every select / gender branch, counts ≥ 1000.
 * Keys are counted per prefix (other batches add keys to the same namespace file).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding, type OnboardingKey } from '@/messages/ns/onboarding';
import { makeT } from '../t';

const t = makeT('he', onboarding);
const PREFIXES = ['signup.', 'whatNow.', 'programPath.'];

describe('onboarding — signup v2 / what-now / program-path keys', () => {
  it('owns exactly the expected keys per prefix', () => {
    const keys = Object.keys(he);
    expect(keys.filter((k) => k.startsWith('signup.'))).toHaveLength(115);
    expect(keys.filter((k) => k.startsWith('whatNow.'))).toHaveLength(9);
    expect(keys.filter((k) => k.startsWith('programPath.'))).toHaveLength(28);
  });

  it('plain strings', () => {
    const cases: Array<[OnboardingKey, string]> = [
      // running-v2/RunningChoiceV2
      ['signup.runChoice.continue', 'המשך'],
      ['signup.runChoice.walking.label', 'הליכה'],
      ['signup.runChoice.walking.sub', 'בלי ריצה — הליכה מהירה, ירידה במשקל, תנועה יומית'],
      ['signup.runChoice.ability.title', 'כמה זמן אפשר לרוץ ברצף?'],
      ['signup.runChoice.ability.description', 'בלי לעצור, בקצב נוח — לא שיא'],
      ['signup.runChoice.ability.info', 'התשובה קובעת את השבוע הראשון בלבד — התוכנית מתעדכנת לפי הריצות שלך'],
      // RunCountStep
      ['signup.run.count.title', 'מתי נרוץ?'],
      ['signup.run.count.subtitle', 'הכנו המלצה — אישור בלחיצה'],
      ['signup.run.count.aside', 'אפשר לשנות'],
      ['signup.run.count.question', 'כמה ריצות בשבוע?'],
      ['signup.run.count.aria', 'מספר ריצות בשבוע'],
      ['signup.run.count.recommended', 'מומלץ'],
      ['signup.run.count.cta.recommended', 'המשך עם ההמלצה'],
      ['signup.run.count.cta.next', 'המשך'],
      // RunDaysStep
      ['signup.days.title', 'באילו ימים?'],
      ['signup.days.subtitle', 'ומתי ביום'],
      ['signup.days.prefilled', 'סימנו לפי ההמלצה · אפשר לשנות'],
      ['signup.days.notFree', 'לא פנוי'],
      ['signup.days.next', 'המשך'],
      // RunWeekStep
      ['signup.run.week.title', 'השבוע שלך'],
      ['signup.run.week.longRunAria', 'יום הריצה הארוכה'],
      ['signup.run.week.longRunLabel', 'הריצה הארוכה ביום'],
      ['signup.run.week.rest', 'מנוחה'],
      ['signup.run.week.notFree', 'לא פנוי'],
      ['signup.run.week.confirm', 'אישור השבוע'],
      // RunSignupScheduleFlow
      ['signup.run.reminder.sampleFallback', 'ריצה'],
      // RunningPlanSummaryV2 + tiles
      ['signup.runSummary.heroAlt', 'רצים בקו הזינוק של מרוץ'],
      ['signup.runSummary.chip.ready', 'התוכנית שלך מוכנה'],
      ['signup.runSummary.volume.title', 'נפח שבועי'],
      ['signup.runSummary.volume.relative', 'נפח יחסי'],
      ['signup.runSummary.legend.build', 'בנייה'],
      ['signup.runSummary.legend.recovery', 'שבוע קל'],
      ['signup.runSummary.legend.goal', 'שבוע המטרה'],
      ['signup.runSummary.cta', 'בואו נתחיל'],
      ['signup.runSummary.back', 'חזרה'],
      ['signup.runSummary.pace.title', 'יעדי קצב'],
      ['signup.runSummary.pace.updates', 'מתעדכן לפי הריצות'],
      ['signup.runSummary.days.title', 'הימים שבחרת'],
      ['signup.runSummary.days.edit', 'שינוי'],
      ['signup.runSummary.firstWeek.title', 'השבוע הראשון'],
      // strength-v2
      ['signup.strength.count.title', 'מתי נתאמן?'],
      ['signup.strength.count.subtitle', 'הכנו המלצה — אישור בלחיצה'],
      ['signup.strength.count.aside', 'אפשר לשנות'],
      ['signup.strength.count.aria', 'מספר ימי אימון בשבוע'],
      ['signup.strength.count.recommended', 'מומלץ'],
      ['signup.strength.count.history.label', 'לא חובה · בחודש האחרון התאמנתי'],
      ['signup.strength.count.history.aria', 'אימונים בחודש האחרון'],
      ['signup.strength.count.history.none', 'בכלל לא'],
      ['signup.strength.count.history.oneTwo', '1–2 בשבוע'],
      ['signup.strength.count.history.threePlus', '3+ בשבוע'],
      ['signup.strength.count.cta.recommended', 'המשך עם ההמלצה'],
      ['signup.strength.count.cta.next', 'המשך'],
      ['signup.strength.week.title', 'השבוע שלך'],
      ['signup.strength.week.days', 'ימים בשבוע'],
      ['signup.strength.week.addRun', 'רוצה להוסיף ריצה? נשלב אותה בלי לפגוע בכוח'],
      ['signup.strength.week.confirm', 'אישור השבוע'],
      // walking-v2
      ['signup.walk.goal.title', 'מה המטרה בהליכה?'],
      ['signup.walk.goal.subtitle', 'אפשר לבחור אחת · נבנה מזה את השבוע'],
      ['signup.walk.goal.aria', 'המטרה בהליכה'],
      ['signup.walk.goal.comfort.question', 'כמה זמן נוח לך ללכת?'],
      ['signup.walk.goal.comfort.aria', 'כמה זמן נוח לך ללכת'],
      ['signup.walk.goal.comfort.short', 'עד 15 דק׳'],
      ['signup.walk.goal.comfort.medium', '20–30 דק׳'],
      ['signup.walk.goal.comfort.long', '45 דק׳ ומעלה'],
      ['signup.walk.goal.addOn.title', 'להוסיף חיזוק קל?'],
      ['signup.walk.goal.next', 'המשך'],
      ['signup.walk.week.title', 'השבוע שלך'],
      ['signup.walk.week.rest', 'מנוחה'],
      ['signup.walk.week.info', 'הליכה מותרת גם ביום כוח וגם יומיים ברצף. כל הליכה נספרת ליעד הצעדים.'],
      ['signup.walk.week.confirm', 'אישור השבוע'],
      ['signup.walk.error.save', 'לא הצלחנו לשמור את השבוע. נסו שוב.'],
      ['signup.walk.days.title', 'מתי נצא להליכה?'],
      ['signup.walk.reminder.sampleFallback', 'הליכה מהירה'],
      // add-track
      ['signup.addTrack.running.title', 'הוספת ריצה לשבוע'],
      ['signup.addTrack.running.subtitle', 'השבוע שלך נשאר · מוסיפים סביבו'],
      ['signup.addTrack.strength.title', 'הוספת כוח לשבוע'],
      ['signup.addTrack.strength.subtitle', 'הריצות שלך נשארות · הכוח נכנס סביבן'],
      ['signup.addTrack.tag.new', 'חדש'],
      ['signup.addTrack.tag.moved', 'הוזז'],
      ['signup.addTrack.legend', 'השבוע הקיים נשמר · ירוק = חדש, כתום = הוזז'],
      ['signup.addTrack.rest', 'מנוחה'],
      ['signup.addTrack.keepOnly.back', 'חזרה לשבוע המומלץ'],
      ['signup.addTrack.keepOnly.offer', 'השאר כמו שהיה ורק הוסף בימים פנויים'],
      ['signup.addTrack.confirm', 'אשר את השבוע החדש'],
      ['signup.addTrack.error.noAccount', 'החשבון שלך לא מזוהה כרגע. נסה שוב.'],
      ['signup.addTrack.error.save', 'לא הצלחנו לשמור את השבוע. אפשר לנסות שוב.'],
      ['signup.addTrack.reminder.sampleFallback', 'אימון'],
      // entry-whatnow (the drawer is a portal Sheet — also pinned by the parity test's Sheet stub)
      ['whatNow.aria', 'מה בא לך עכשיו?'],
      ['whatNow.browse', 'או רק להסתכל מסביב'],
      ['whatNow.plan.tag', 'מומלץ לך'],
      ['whatNow.plan.title', 'תוכנית אישית בשבילך'],
      ['whatNow.plan.sub', 'כוח, ריצה או שניהם. נבנית לפי הרמה, הזמן והמקום שלך.'],
      ['whatNow.plan.cta', '2 דק׳ · בואו נבנה '],
      ['whatNow.kelly.initial', 'ק'],
      ['whatNow.kelly.title', 'משהו אחר? לדבר עם קלי'],
      ['whatNow.kelly.sub', 'ספרו במילים שלכם, וקלי יבנה לכם'],
      // program-path
      ['programPath.back', 'חזרה'],
      ['programPath.testLine.health', 'מבחן קצר: 4 תרגילים לכל הגוף'],
      ['programPath.testLine.bodyFocus', 'המבחן: רק האזורים שבחרת'],
      ['programPath.testLine.skills', 'המבחן: סולם לכל אלמנט + ליבה'],
      ['programPath.goal.bodyFocus.title', 'לחטב ולבנות שריר'],
      ['programPath.goal.bodyFocus.level', 'לכל רמה'],
      ['programPath.goal.skills.title', 'קליסטניקס: לפתוח אלמנטים'],
      ['programPath.goal.skills.sub', 'למי שעושה כבר כמה מתח ומקבילים ורוצה לפתוח עליית כוח, עמידת ידיים ופלאנץ׳'],
      ['programPath.note.label', 'יש עוד משהו שחשוב לך?'],
      ['programPath.note.optional', 'לא חובה'],
      ['programPath.title', 'מה הכי חשוב לך?'],
      ['programPath.areas.title', 'על מה נתמקד?'],
      ['programPath.areas.recommended', 'מומלץ'],
      ['programPath.skills.tag', 'קליסטניקס'],
      ['programPath.skills.master.title', 'קליסטניקס עליון'],
      ['programPath.skills.soon', 'בקרוב'],
      ['programPath.skills.tip.label', 'טיפ מהמאמן: '],
      ['programPath.skills.tip.push', 'כדי לשמור על כתפיים מאוזנות, כדאי להוסיף גם אלמנט אחד מקבוצת הדחיפה.'],
      ['programPath.skills.tip.pull', 'כדי לשמור על כתפיים מאוזנות, כדאי להוסיף גם אלמנט אחד מקבוצת המשיכה.'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('values: the old templates, verbatim', () => {
    const letter = 'ג';
    expect(t('signup.days.progress', { done: String(2), total: String(3) })).toBe(`${2} מתוך ${3}`);
    expect(t('signup.days.windowAria', { letter })).toBe(`שעה ביום ${letter}׳`);
    expect(t('signup.days.removeAria', { letter })).toBe(`הסרת יום ${letter}׳`);
    expect(t('signup.days.addAria', { letter })).toBe(`הוספת יום ${letter}׳`);
    for (const left of [1, 2, 5]) {
      expect(t('signup.days.remaining', { n: left })).toBe(left === 1 ? 'עוד יום אחד לסמן' : `עוד ${left} ימים לסמן`);
    }

    expect(t('signup.run.plan.weeks', { weeks: String(12) })).toBe(`${12} שבועות`);
    expect(t('signup.run.week.subtitle', { plan: 'תוכנית 10 ק״מ' })).toBe(`ריצה · ${'תוכנית 10 ק״מ'} · מוכן לאישור`);
    expect(t('signup.run.reminder.subtitle', { count: String(3), days: 'א׳ ג׳ ה׳' })).toBe(`${3} ריצות בשבוע · ${'א׳ ג׳ ה׳'}`);

    const v = { current: 3, weeks: 12, done: 1234, due: 2000, end: '12.12', frequency: 3 };
    expect(t('signup.runSummary.chip.view', { current: String(v.current), weeks: String(v.weeks) })).toBe(`שבוע ${v.current} מתוך ${v.weeks}`);
    expect(
      t('signup.runSummary.line.view', { done: String(v.done), due: String(v.due), end: v.end, frequency: String(v.frequency) }),
    ).toBe(`${v.done}/${v.due} אימונים בוצעו · עד ${v.end} · ${v.frequency} ריצות בשבוע`);
    expect(t('signup.runSummary.line.create', { weeks: String(v.weeks), end: v.end, frequency: String(v.frequency) })).toBe(
      `${v.weeks} שבועות · עד ${v.end} · ${v.frequency} ריצות בשבוע`,
    );
    expect(t('signup.runSummary.volume.aria', { count: String(12) })).toBe(`נפח שבועי יחסי לאורך ${12} שבועות`);
    expect(t('signup.runSummary.pace.range', { range: '6:20–6:50' })).toBe(`${'6:20–6:50'} /ק״מ`);
    expect(t('signup.runSummary.days.runAria', { letter, slot: 'ריצה ארוכה' })).toBe(`${letter}׳ · ${'ריצה ארוכה'}`);
    expect(t('signup.runSummary.days.restAria', { letter })).toBe(`${letter}׳ · מנוחה`);
    expect(t('signup.runSummary.firstWeek.count', { count: String(4) })).toBe(`${4} ריצות`);

    expect(t('signup.strength.week.recoveryNote', { hours: String(48) })).toBe(`כל שריר מקבל ${48} שעות לפני שחוזרים אליו.`);

    const steps = (12345).toLocaleString('he-IL');
    expect(t('signup.walk.goal.stepsToday', { steps })).toBe(`היעד שלך היום: ${steps} צעדים`);
    expect(t('signup.walk.reminder.subtitle', { count: String(4), days: 'א׳ ב׳' })).toBe(`${4} הליכות בשבוע · ${'א׳ ב׳'}`);
    expect(t('signup.walk.reminder.sampleDetail', { minutes: String(30), steps })).toBe(`${30} דק׳ · ~${steps} צעדים`);
  });

  it('selects: every branch of the old ternary / map', () => {
    // RunSignupScheduleFlow.planName (DIST_LABEL + 5k fallback)
    const DIST_LABEL: Record<string, string> = { '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ', '10k': '10 ק״מ' };
    const planName = (d: string) => (d === 'maintenance' ? 'תוכנית לשמירה על כושר' : `תוכנית ${DIST_LABEL[d] ?? DIST_LABEL['5k']}`);
    for (const d of ['2k', '3k', '5k', '10k', 'maintenance', '42k', 'undefined', '']) {
      expect(t('signup.run.plan.name', { distance: d })).toBe(planName(d));
    }

    // RunningPlanSummaryV2 title
    for (const goal of ['maintenance', '5k', '10k', '']) {
      expect(t('signup.runSummary.title', { goal, dist: '10 ק״מ' })).toBe(goal === 'maintenance' ? 'תוכנית לשמירה על כושר' : `תוכנית ${'10 ק״מ'}`);
    }

    // StrengthSignupScheduleFlow subtitle: ['כוח', ...counts, 'מוכן לאישור'].join(' · ')
    for (const counts of [[], ['כל הגוף ×3'], ['פלג עליון ×2', 'רגליים ×1']]) {
      expect(t('signup.strength.week.subtitle', { hasCounts: counts.length > 0 ? 'yes' : 'no', counts: counts.join(' · ') })).toBe(
        ['כוח', ...counts, 'מוכן לאישור'].join(' · '),
      );
    }

    // WalkGoalStep add-on line
    for (const perWeek of [1, 2, 3, 1000]) {
      expect(t('signup.walk.goal.addOn.line', { minutes: String(10), perWeek: String(perWeek) })).toBe(
        `${10} דק׳ ליבה וגב, ${perWeek === 2 ? 'פעמיים' : `${perWeek} פעמים`} בשבוע, בבית`,
      );
    }

    // WalkSignupFlow days subtitle
    for (const usual of [null, { minutes: 30 }]) {
      const f = 4;
      expect(
        t('signup.walk.days.subtitle', { hasUsual: usual ? 'yes' : 'no', count: String(f), minutes: usual ? String(usual.minutes) : '' }),
      ).toBe(`ממליצים ${f} הליכות בשבוע${usual ? ` · ${usual.minutes} דק׳` : ''} · שבת חופשית`);
    }

    // AddTrackWeekStep session subtitle + AddTrackFlow reminder subtitle
    for (const kind of ['run', 'strength']) {
      expect(t('signup.addTrack.session.subtitle', { kind, time: '07:00' })).toBe(`${kind === 'run' ? 'ריצה' : 'כוח'} · ${'07:00'}`);
    }
    for (const added of ['running', 'strength']) {
      expect(t('signup.addTrack.reminder.subtitle', { count: String(1234), added })).toBe(
        `${1234} אימונים בשבוע · ${added === 'running' ? 'כוח וריצה' : 'ריצה וכוח'}`,
      );
    }
  });

  it('gender: male / female keep the old two-way pick, unknown is neutral', () => {
    // StrengthSignupScheduleFlow (gender from the wizard identity, passed explicitly)
    // Gender batch 3: male keeps the old copy, unknown / 'other' is neutral.
    for (const gender of ['male', 'female', 'other']) {
      expect(t('signup.strength.count.question', { gender })).toBe(
        gender === 'female'
          ? 'כמה ימים בשבוע את פנויה להתאמן?'
          : gender === 'male'
            ? 'כמה ימים בשבוע אתה פנוי להתאמן?'
            : 'כמה ימים בשבוע פנויים לאימון?',
      );
    }
    // ProgramPathV2View / ProgramPathSkillsStepV2: the real gender prop (gender batch 3) —
    // male keeps the old masculine copy, unknown / 'other' gets the neutral one.
    const triples: Array<[OnboardingKey, string, string, string]> = [
      ['programPath.goal.health.title', 'להרגיש טוב וחזק', 'להרגיש טובה וחזקה', 'להרגיש טוב ולהתחזק'],
      ['programPath.goal.health.sub', 'למי שמתחיל, חוזר אחרי הפסקה או רוצה בסיס בריא לכל הגוף', 'למי שמתחילה, חוזרת אחרי הפסקה או רוצה בסיס בריא לכל הגוף', 'להתחלה, לחזרה אחרי הפסקה או לבסיס בריא לכל הגוף'],
      ['programPath.goal.health.level', 'מתחילים', 'מתחילות', 'מתחילים'],
      ['programPath.goal.bodyFocus.sub', 'למי שכבר מתאמן ורוצה לעלות רמה, לחזור לכושר או למקד אזורים', 'למי שכבר מתאמנת ורוצה לעלות רמה, לחזור לכושר או למקד אזורים', 'כבר מתאמנים? לעלות רמה, לחזור לכושר או למקד אזורים'],
      ['programPath.goal.skills.level', 'מתקדמים', 'מתקדמות', 'מתקדמים'],
      ['programPath.subtitle', 'בחר מטרה אחת. את הרמה המדויקת נמדוד במבחן הקצר.', 'בחרי מטרה אחת. את הרמה המדויקת נמדוד במבחן הקצר.', 'בוחרים מטרה אחת. את הרמה המדויקת נמדוד במבחן הקצר.'],
      ['programPath.skills.title', 'איזה אלמנט אתה רוצה לפתוח?', 'איזה אלמנט את רוצה לפתוח?', 'איזה אלמנט רוצים לפתוח?'],
      ['programPath.skills.subtitle', 'אפשר לבחור עד 3. הראשון שתבחר יהיה בעדיפות.', 'אפשר לבחור עד 3. הראשון שתבחרי יהיה בעדיפות.', 'אפשר לבחור עד 3. הראשון שנבחר יהיה בעדיפות.'],
      ['programPath.skills.master.sub', 'לא בטוח? מסלול שמשלב את כל האלמנטים', 'לא בטוחה? מסלול שמשלב את כל האלמנטים', 'לא בטוחים? מסלול שמשלב את כל האלמנטים'],
    ];
    for (const [key, m, f, n] of triples) {
      expect(t(key, { gender: 'male' })).toBe(m);
      expect(t(key, { gender: 'female' })).toBe(f);
      expect(t(key, { gender: 'other' })).toBe(n);
      expect(t(key)).toBe(n);
    }
  });

  it('every key of the three prefixes parses and renders', () => {
    const values = {
      gender: 'other', distance: '', goal: '', dist: '', hasCounts: '', counts: '', perWeek: '', minutes: '',
      hasUsual: '', count: '', kind: '', time: '', added: '', n: 2, done: '', total: '', letter: '', weeks: '',
      plan: '', days: '', current: '', due: '', end: '', frequency: '', range: '', slot: '', hours: '', steps: '',
    };
    for (const k of Object.keys(he).filter((key) => PREFIXES.some((p) => key.startsWith(p)))) {
      expect(typeof t(k as OnboardingKey, values)).toBe('string');
    }
  });
});
