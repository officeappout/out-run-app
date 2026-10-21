/**
 * Namespace `community` (i18n wave 2, the arena cards / sheets / session banner in
 * src/features/arena/components): every Hebrew key returns exactly what the code rendered before
 * the extraction. The `old` side of each case is the original literal / template expression (or
 * the old helper, re-declared verbatim), copied from the pre-extraction components.
 *
 * The parity snapshots (src/features/arena/components/__tests__/arena-components-i18n-*.test.tsx)
 * cover the keys in context; this test also pins every select / plural / gender branch, counts
 * ≥ 1000 (no thousands separator) and the keys a static render can't reach.
 * The group page's `group.*` keys live in community-he.test.ts.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/community.json';
import { community } from '@/messages/ns/community';
import { makeT } from '../t';

const t = makeT('he', community);
type Key = keyof typeof he;

const PREFIXES: Record<string, number> = {
  attendees: 1, mapCard: 1, circles: 1, groupCard: 17, eventCard: 4, session: 13, nav: 3, report: 13,
  postJoin: 10, banner: 28, creator: 23, inviteBonus: 7, cityChallenge: 6, pressure: 7, outreach: 15, goalEditor: 7,
};
const GENDERS = ['female', 'male', 'other'] as const;
const g = (gender: string, f: string, m: string) => (gender === 'female' ? f : m);

describe('community (he) arena components — byte-identical to the pre-extraction literals', () => {
  it('owns exactly the keys this test pins (count per prefix, not the namespace total)', () => {
    for (const [prefix, n] of Object.entries(PREFIXES)) {
      expect([prefix, Object.keys(he).filter((k) => k.startsWith(`${prefix}.`)).length]).toEqual([prefix, n]);
    }
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['mapCard.alt', 'מפה'],
      ['circles.createOrJoin', 'יצירה / הצטרפות'],
      ['groupCard.community', 'קהילתי'],
      ['groupCard.live.compact.active', 'לייב'],
      ['groupCard.live.compact.soon', 'בקרוב'],
      ['groupCard.live.active', '🟢 לייב'],
      ['groupCard.live.soon', '🟠 בקרוב'],
      ['groupCard.updateLocation', 'עדכון למיקום הנוכחי שלי'],
      ['groupCard.code.label', 'קוד הצטרפות'],
      ['groupCard.code.submit', 'אישור'],
      ['groupCard.code.cancel', 'ביטול הזנת קוד'],
      ['groupCard.code.wrong', 'קוד שגוי, אנא נסו שנית'],
      ['groupCard.chat', "כנס לצ'אט"],
      ['groupCard.enterCode', 'הזנת קוד'],
      ['groupCard.join', 'הצטרפות'],
      ['eventCard.official', 'רשמי'],
      ['eventCard.registered', 'רשום/ה'],
      ['eventCard.register', 'הרשמה'],
      ['session.official', 'רשמי'],
      ['session.mapAlt', 'מפה'],
      ['session.muscles', 'קבוצות שרירים'],
      ['session.equipment', 'ציוד נדרש'],
      ['session.full', 'מלא'],
      ['session.externalLink', 'להרשמה ופרטים נוספים'],
      ['session.registered', 'רשום/ה לאירוע'],
      ['session.register', 'הרשמה לאירוע'],
      ['session.report', 'דיווח על תוכן לא ראוי'],
      ['session.close', 'סגירה'],
      ['nav.title', 'ניווט למיקום'],
      ['nav.inAppMap', 'מפה בתוך האפליקציה'],
      ['nav.close', 'סגירה'],
      ['report.reason.spam', 'ספאם / תוכן מסחרי'],
      ['report.reason.inappropriate', 'תוכן לא ראוי'],
      ['report.reason.harassment', 'הטרדה או אלימות'],
      ['report.reason.misinformation', 'מידע מטעה'],
      ['report.reason.impersonation', 'התחזות'],
      ['report.reason.other', 'אחר'],
      ['report.sent', 'הדיווח נשלח'],
      ['report.thanks', 'תודה על שמירת הקהילה. נבדוק את הדיווח בהקדם.'],
      ['report.done', 'סגירה'],
      ['report.submit', 'שליחת דיווח'],
      ['report.close', 'סגירה'],
      ['postJoin.addToPlanner', 'הוספת המפגשים ללוז האימונים'],
      ['postJoin.calendarSync', 'סנכרון ליומן הטלפון'],
      ['postJoin.invite', 'הזמן שותף/ה'],
      ['postJoin.chat', "כנס לצ'אט הקהילה"],
      ['postJoin.later', 'אחר כך'],
      ['postJoin.close', 'סגירה'],
      ['banner.countdown.now', 'עכשיו'],
      ['banner.date.today', 'היום'],
      ['banner.date.tomorrow', 'מחר'],
      ['banner.late.ack', 'הבנו, נחכה לך ❤️'],
      ['banner.skip', 'לא הפעם'],
      ['banner.booked', 'אושר!'],
      ['banner.confirmArrival', 'אישור הגעה'],
      ['banner.fallback', 'מפגש קהילתי בקרוב'],
      ['banner.onMyWay.cta', '✋ אני בדרך'],
      ['banner.started', 'המפגש החל!'],
      ['banner.here', 'אני כאן! 🙌'],
      ['banner.active.label', 'פעיל'],
      ['banner.summary', 'לסיכום'],
      ['creator.title', 'ניהול קהילה'],
      ['creator.close', 'סגירה'],
      ['creator.quickActions', 'פעולות מהירות'],
      ['creator.edit.title', 'עריכת פרטי הקהילה'],
      ['creator.edit.subtitle', 'שם, תיאור, מיקום, לוח זמנים'],
      ['creator.stats.title', 'צפה בסטטיסטיקות'],
      ['creator.stats.subtitle', 'בקרוב — נתוני פעילות ונוכחות'],
      ['creator.members.title', 'חברי הקהילה'],
      ['creator.members.empty', 'אין חברים רשומים עדיין'],
      ['creator.members.owner', 'בעלים'],
      ['creator.members.admin', 'מנהל/ת'],
      ['creator.members.promote', 'הפוך למנהל'],
      ['creator.members.promoteHint', 'אותן סמכויות כמו שלך'],
      ['creator.members.demote', 'הסר ניהול'],
      ['creator.members.remove', 'הסר מהקבוצה'],
      ['creator.remove.title', 'הסרת חבר/ה'],
      ['creator.remove.note', 'המשתמש יוסר מהקבוצה, מהצ׳אט ומהלוז האישי שלו'],
      ['creator.remove.confirm', 'הסרה'],
      ['creator.remove.cancel', 'ביטול'],
      ['inviteBonus.cta', 'הזמנת חבר'],
      ['pressure.defaultContact', 'מחלקת הספורט'],
      ['pressure.sent', 'נשלח! תודה שלחצת'],
      ['outreach.school.sent', 'נשלח! תודה 🎓'],
      ['outreach.company.sent', 'נשלח! תודה 🤝'],
      ['outreach.youth.sent', 'נשלח! תודה 🔥'],
      ['goalEditor.none', 'ללא יעד'],
      ['goalEditor.pill.distance', '📍 מרחק'],
      ['goalEditor.pill.time', '⏱ זמן'],
      ['goalEditor.label.distance', 'מרחק'],
      ['goalEditor.label.time', 'משך זמן'],
    ];
    for (const [key, old] of cases) expect([key, t(key)]).toEqual([key, old]);
  });

  it('category selects (label map + fallback)', () => {
    const GROUP = { walking: 'הליכה', running: 'ריצה', yoga: 'יוגה', calisthenics: 'קליסתניקס', cycling: 'רכיבה', other: 'אחר' } as Record<string, string>;
    const EVENT = { race: 'מרוץ', fitness_day: 'יום כושר', workshop: 'סדנה', community_meetup: 'מפגש קהילתי', other: 'אחר' } as Record<string, string>;
    for (const category of [...Object.keys(GROUP), 'mystery', '']) {
      // GroupCard: CATEGORY_CONFIG[c].label (only known ids reach it); CreatorManagementDrawer: ?? other.
      if (category in GROUP) expect(t('groupCard.category', { category })).toBe(GROUP[category]);
      expect(t('creator.category', { category })).toBe((GROUP[category] ?? GROUP.other));
    }
    for (const category of [...Object.keys(EVENT), 'mystery', '']) {
      if (category in EVENT) expect(t('eventCard.category', { category })).toBe(EVENT[category]);
      // SessionDrawer: CATEGORY_CONFIG[event.category] ?? CATEGORY_CONFIG.other
      expect(t('session.category', { category })).toBe(EVENT[category] ?? EVENT.other);
    }
  });

  it('counts and plurals (no thousands separator)', () => {
    for (const n of [0, 1, 2, 7, 1234]) {
      const oldCount = `${n} ${n === 1 ? 'משתתף' : 'משתתפים'}`;
      expect(t('attendees.count', { n, count: String(n) })).toBe(oldCount);
      expect(t('session.attendees', { n, count: String(n) })).toBe(oldCount);
      expect(t('session.capacity', { count: String(n), max: String(1500) })).toBe(`${n} / ${1500} משתתפים`);
      expect(t('banner.arrived.ofMax', { count: String(n), max: String(1200) })).toBe(`${n}/${1200} הגיעו`);
      expect(t('banner.arrived.count', { count: String(n) })).toBe(`${n} הגיעו`);
      // Old JSX: פעיל{activeCount > 0 ? ` · ${activeCount} כאן` : ''}
      const nowActive = n > 0 ? t('banner.active.here', { count: String(n) }) : t('banner.active.label');
      expect(nowActive).toBe(`פעיל${n > 0 ? ` · ${n} כאן` : ''}`);
      expect(t('creator.memberCount', { count: String(n) })).toBe(` · ${n} חברים`);
      for (const gender of GENDERS) {
        expect(t('banner.participants', { active: String(n), max: String(2000), gender })).toBe(`${n} / ${2000} ${g(gender, 'משתתפות', 'משתתפים')}`);
      }
    }
  });

  it('GroupCard travel time — the old travelTimeLabel, verbatim', () => {
    const old = (km: number): string | null => {
      const roadKm = km * 1.3;
      if (roadKm < 1.5) {
        const mins = Math.ceil((roadKm / 5) * 60);
        return `~${mins} דק׳ הליכה`;
      }
      const mins = Math.ceil((roadKm / 30) * 60);
      if (mins > 120) return null;
      return `~${mins} דק׳ נסיעה`;
    };
    for (const km of [0, 0.3, 1, 1.15, 2, 12, 40]) {
      const roadKm = km * 1.3;
      const now = roadKm < 1.5
        ? t('groupCard.travel.walk', { mins: String(Math.ceil((roadKm / 5) * 60)) })
        : t('groupCard.travel.drive', { mins: String(Math.ceil((roadKm / 30) * 60)) });
      expect(now).toBe(old(km));
    }
    expect(t('groupCard.travel.drive', { mins: String(1234) })).toBe('~1234 דק׳ נסיעה');
    expect(t('groupCard.today', { time: '18:30' })).toBe(`מפגש היום · ${'18:30'}`);
  });

  it('ReportContentSheet title + prompt per target type', () => {
    const TARGET_LABEL = { group: 'הקבוצה', event: 'האירוע', post: 'הפוסט', user: 'המשתמש' } as const;
    const PROMPT_BY_TYPE = {
      group: 'מדוע ברצונך לדווח על הקבוצה',
      event: 'מדוע ברצונך לדווח על האירוע',
      post: 'מדוע ברצונך לדווח על הפוסט של',
      user: 'מדוע ברצונך לדווח על המשתמש',
    } as const;
    const name = "רצי 'הירקון' {x}";
    for (const type of ['group', 'event', 'post', 'user'] as const) {
      expect(t('report.title', { type })).toBe(`דיווח על ${TARGET_LABEL[type]}`);
      // JSX: {promptPrefix} &ldquo;{targetName}&rdquo;?
      expect(t('report.prompt', { type, name })).toBe(`${PROMPT_BY_TYPE[type]} “${name}”?`);
    }
  });

  it('PostJoinSuccessDrawer', () => {
    const name = 'רצי הירקון';
    const url = 'https://app.example';
    expect(t('postJoin.shareText', { name, url })).toBe(`היי, הצטרפתי ל-${name} ב-OutRun! בואו להתאמן איתי: ${url}`); // gender batch 2: בוא/י → בואו (decision 7)
    expect(t('postJoin.title', { name })).toBe(`איזה כיף! הצטרפת ל-${name}`);
    expect(t('postJoin.subtitle', { verb: 'ירוץ' })).toBe(`הזמן שותף ש${'ירוץ'} איתך!`);
    expect(t('postJoin.aria', { name })).toBe(`הצטרפת ל-${name}`);
  });

  it('CommunitySessionBanner — the old formatCountdown, verbatim', () => {
    const old = (mins: number): string | null => {
      if (mins <= -60) return null;
      if (mins < 0) return `החל לפני ${Math.abs(Math.round(mins))} דק׳`;
      if (mins < 1) return 'עכשיו';
      if (mins < 60) return `עוד ${Math.round(mins)} דקות`;
      const hours = Math.floor(mins / 60);
      const rem = Math.round(mins % 60);
      const hoursStr = hours === 1 ? 'שעה' : hours === 2 ? 'שעתיים' : `${hours} שעות`;
      if (rem === 0) return `עוד ${hoursStr}`;
      return `עוד ${hoursStr} ו-${rem} דק׳`;
    };
    const now = (mins: number): string | null => {
      if (mins <= -60) return null;
      if (mins < 0) return t('banner.countdown.started', { mins: String(Math.abs(Math.round(mins))) });
      if (mins < 1) return t('banner.countdown.now');
      if (mins < 60) return t('banner.countdown.minutes', { mins: String(Math.round(mins)) });
      const hours = Math.floor(mins / 60);
      const rem = Math.round(mins % 60);
      if (rem === 0) return t('banner.countdown.hours', { h: hours, hours: String(hours) });
      return t('banner.countdown.hoursMinutes', { h: hours, hours: String(hours), rem: String(rem) });
    };
    for (const mins of [-75, -59.6, -12.4, -0.2, 0, 0.6, 1, 37.6, 59.4, 60, 61, 95, 120, 150, 179.6, 180, 245, 600, 60 * 1500, 60 * 1500 + 7]) {
      expect([mins, now(mins)]).toEqual([mins, old(mins)]);
    }
  });

  it('CommunitySessionBanner — gendered copy (g(f, m) on isFeminine) and goal chip', () => {
    for (const gender of GENDERS) {
      // Gender batch 2 (21.10.2026): male keeps the old masculine text, other is neutral.
      const g3 = (f: string, m: string, n: string) => (gender === 'female' ? f : gender === 'male' ? m : n);
      expect(t('banner.late.toggle', { gender })).toBe(g3('מאחרת?', 'מאחר?', 'מאחרים?'));
      expect(t('banner.register', { gender })).toBe(g3('הירשמי', 'הירשם', 'הרשמה'));
      expect(t('banner.confirmArrival', { gender })).toBe(g3('אשרי הגעה', 'אשר הגעה', 'אישור הגעה'));
      expect(t('banner.onMyWay.done', { gender })).toBe(g3('בדרך! 🏃‍♀️', 'בדרך! 🏃', 'בדרך! 🏃'));
      expect(t('banner.joinWorkout', { gender })).toBe(g3('הצטרפי לאימון', 'הצטרף לאימון', 'מצטרפים לאימון'));
      expect(t('banner.ended', { gender })).toBe(g3('סיימתן! 💪', 'סיימתם! 💪', 'סיימתם! 💪'));
    }
    for (const m of [2, 5, 10, 15]) expect(t('banner.late.option', { m: String(m) })).toBe(`+${m} דק׳`);
    for (const goal of [{ type: 'distance', value: 5 }, { type: 'distance', value: 12.34 }, { type: 'time', value: 2700 }, { type: 'time', value: 90 }]) {
      const label = goal.type === 'distance' ? `${goal.value.toFixed(1)} ק״מ` : `${Math.round(goal.value / 60)} דק׳`;
      const value = goal.type === 'distance' ? goal.value.toFixed(1) : String(Math.round(goal.value / 60));
      expect(t('banner.goal', { type: goal.type, value })).toBe(`🎯 יעד אישי · ${label}`);
      // WorkoutGoalEditor's valueText: same shape without the prefix.
      expect(t('goalEditor.value', { type: goal.type, value })).toBe(label);
    }
  });

  it('CreatorManagementDrawer — member actions + remove question (rich: the name is bold)', () => {
    expect(t('creator.members.actions', { name: 'מיכל' })).toBe(`${'מיכל'} · פעולות מנהל`);
    expect(t.rich('creator.remove.question', { name: 'מיכל', b: (c: unknown) => `[${String(c)}]` }).join('')).toBe(
      `האם להסיר את${' '}[${'מיכל'}]${' '}מהקהילה?`,
    );
  });

  it('InviteBonusCard', () => {
    const BONUS = 50;
    const SLOTS = 5;
    const link = 'https://onelink.to/appout?ref=u1';
    for (const scopeName of ['נווה צדק', null, undefined, '']) {
      const old = `בואו להתאמן איתי${scopeName ? ` ב${scopeName}` : ''} ב-OUT 💪 ${link}`;
      const now = scopeName ? t('inviteBonus.shareText.scoped', { scope: scopeName, link }) : t('inviteBonus.shareText.plain', { link });
      expect(now).toBe(old);
      const oldBody = `הנקודות נכנסות לליגת ${scopeName ? `${scopeName} ול` : 'השכונה וה'}עיר שלך, עד ${SLOTS} חברים בשבוע.`;
      const nowBody = scopeName
        ? t('inviteBonus.body.scoped', { scope: scopeName, slots: String(SLOTS) })
        : t('inviteBonus.body.neighborhood', { slots: String(SLOTS) });
      expect(nowBody).toBe(oldBody);
    }
    expect(t('inviteBonus.title', { bonus: String(BONUS) })).toBe(`חבר שמצטרף = +${BONUS} נק׳`);
    for (const joined of [0, 3, 5]) expect(t('inviteBonus.slotsAria', { joined: String(joined), slots: String(SLOTS) })).toBe(`${joined} מתוך ${SLOTS} חברים הצטרפו`);
  });

  it('CityChallengeCard', () => {
    const name = 'הרצליה';
    expect(t('cityChallenge.title', { name })).toBe(`אתגר המיליון של ${name}`);
    expect(t('cityChallenge.subtitle', { goal: (1_000_000).toLocaleString('he-IL'), month: 'אוקטובר' })).toBe(
      `כל העיר יחד · ${(1_000_000).toLocaleString('he-IL')} נק׳ ב${'אוקטובר'}`,
    );
    for (const pct of [0, 12.3, 100]) {
      expect(t('cityChallenge.active', { count: (4321).toLocaleString('he-IL'), pct: String(pct) })).toBe(`${(4321).toLocaleString('he-IL')} פעילים · ${pct}%`);
      expect(t('cityChallenge.aria', { pct: String(pct) })).toBe(`${pct}% מהיעד`);
    }
    expect(t('cityChallenge.done', { name })).toBe(`${name} הגיעה ליעד החודשי!`);
    const left = 876544;
    expect(t('cityChallenge.left', { left: left.toLocaleString('he-IL') })).toBe(`עוד ${left.toLocaleString('he-IL')} נק׳ ליעד — כל אימון וכל 1,000 צעדים מקרבים.`);
  });

  it('MunicipalPressureCard — default templates keep their ${var} placeholders', () => {
    const DEFAULT_MALE =
      'היי ${contactPerson}, אני אווטיר ב-Out ומתאמן בנבחרת של ${cityName}. אנחנו רוצים שתפתחו לנו את הליגה הרשמית והפרסים! 🔥';
    const DEFAULT_FEMALE =
      'היי ${contactPerson}, אני אווטירית ב-Out ומתאמנת בנבחרת של ${cityName}. אנחנו רוצים שתפתחו לנו את הליגה הרשמית והפרסים! 🔥';
    const vars = { contactPerson: '${contactPerson}', cityName: '${cityName}' };
    // Gender batch 2 (21.10.2026): male / female keep the old texts; unknown / other is neutral
    // (was: the masculine text). The caller passes male / female / other (MunicipalPressureCard).
    const DEFAULT_NEUTRAL =
      'היי ${contactPerson}, אני מהנבחרת של ${cityName} ב-Out. אנחנו רוצים שתפתחו לנו את הליגה הרשמית והפרסים! 🔥';
    for (const gender of ['female', 'male', 'other'] as const) {
      const g3 = (f: string, m: string, n: string) => (gender === 'female' ? f : gender === 'male' ? m : n);
      expect(t('pressure.message', { ...vars, gender })).toBe(g3(DEFAULT_FEMALE, DEFAULT_MALE, DEFAULT_NEUTRAL));
      const contact = 'יוסי';
      expect(t('pressure.body', { contact, gender })).toBe(
        `${g3('בואי נזיז אותם! שלחי', 'בוא נזיז אותם! שלח', 'בואו נזיז אותם! שלחו')} הודעה ל${contact} כדי שיפתחו את הליגה, הדירוגים והפרסים.`,
      );
      expect(t('pressure.cta', { gender })).toBe(`📢 ${g3('שלחי הודעה', 'שלח הודעה', 'שליחת הודעה')} לעירייה`);
    }
    const city = 'הרצליה';
    expect(t('pressure.mailSubject', { city })).toBe(`פתחו את הליגה ב-${city}!`);
    expect(t('pressure.title', { city })).toBe(`עיריית ${city} עדיין לא פתחה את הליגה הרשמית`);
  });

  it('SchoolOutreachCard — the old ORG_COPY, verbatim', () => {
    type G = 'male' | 'female';
    const OLD = {
      school: {
        defaultMale: 'היי, אני תלמיד ב-${orgName} ומתאמן עם Out. רציתי להציע שנביא את הפלטפורמה לבית הספר — זה בחינם ומדליק! 🔥',
        defaultFemale: 'היי, אני תלמידה ב-${orgName} ומתאמנת עם Out. רציתי להציע שנביא את הפלטפורמה לבית הספר — זה בחינם ומדליק! 🔥',
        title: (orgName: string) => `רוצה להביא את Out ל${orgName}?`,
        // Gender batch 2: no slash forms — "המנהל/ת" → "הנהלת בית הספר", "המורה ישמע" → "כל הצוות ישמע".
        subtitle: (g: G) => `${g === 'female' ? 'דברי' : 'דבר'} עם הנהלת בית הספר! ${g === 'female' ? 'שלחי' : 'שלח'} הודעה בוואטסאפ וכל הצוות ישמע על Out.`,
        buttonIdle: (g: G) => `🏫 ${g === 'female' ? 'שלחי' : 'שלח'} הודעה להנהלת בית הספר`,
      },
      company: {
        defaultMale: 'היי, אני עובד ב-${orgName} ומתאמן עם Out. שווה שנביא את זה לארגון — בחינם ומחזק את הצוות! 💪',
        defaultFemale: 'היי, אני עובדת ב-${orgName} ומתאמנת עם Out. שווה שנביא את זה לארגון — בחינם ומחזק את הצוות! 💪',
        title: (orgName: string) => `רוצה ש-Out יגיע ל${orgName}?`,
        subtitle: (g: G) => `${g === 'female' ? 'דברי' : 'דבר'} עם מחלקת הרווחה / HR ושתפו את הצוות בוואטסאפ.`,
        buttonIdle: (g: G) => `🏢 ${g === 'female' ? 'שלחי' : 'שלח'} הודעה ל-HR`,
      },
      youth: {
        defaultMale: 'היי, אני חניך ב-${orgName} ומתאמן עם Out. בואו נביא את זה לתנועה — אימונים מגניבים בחינם! 🔥',
        defaultFemale: 'היי, אני חניכה ב-${orgName} ומתאמנת עם Out. בואו נביא את זה לתנועה — אימונים מגניבים בחינם! 🔥',
        title: (orgName: string) => `רוצה את Out ב${orgName}?`,
        subtitle: (g: G) => `${g === 'female' ? 'דברי' : 'דבר'} עם צוות התנועה ושתפו את החניכים בוואטסאפ.`,
        buttonIdle: (g: G) => `⛺ ${g === 'female' ? 'שלחי' : 'שלח'} הודעה לצוות התנועה`,
      },
    } as const;
    for (const org of ['school', 'company', 'youth'] as const) {
      const old = OLD[org];
      for (const gender of ['male', 'female'] as const) {
        expect(t(`outreach.${org}.message`, { orgName: '${orgName}', gender })).toBe(gender === 'female' ? old.defaultFemale : old.defaultMale);
        expect(t(`outreach.${org}.subtitle`, { gender })).toBe(old.subtitle(gender));
        expect(t(`outreach.${org}.cta`, { gender })).toBe(old.buttonIdle(gender));
      }
      expect(t(`outreach.${org}.title`, { orgName: 'תיכון הרצוג' })).toBe(old.title('תיכון הרצוג'));
    }
    // Unknown / other gender: neutral (was the masculine text).
    const NEUTRAL = {
      school: ['היי, אני מ-${orgName} ואני באפליקציית Out. רציתי להציע שנביא את הפלטפורמה לבית הספר — זה בחינם ומדליק! 🔥', 'דברו עם הנהלת בית הספר! שלחו הודעה בוואטסאפ וכל הצוות ישמע על Out.', '🏫 שליחת הודעה להנהלת בית הספר'],
      company: ['היי, אני מ-${orgName} ואני באפליקציית Out. שווה שנביא את זה לארגון — בחינם ומחזק את הצוות! 💪', 'דברו עם מחלקת הרווחה / HR ושתפו את הצוות בוואטסאפ.', '🏢 שליחת הודעה ל-HR'],
      youth: ['היי, אני מ-${orgName} ואני באפליקציית Out. בואו נביא את זה לתנועה — אימונים מגניבים בחינם! 🔥', 'דברו עם צוות התנועה ושתפו את החניכים בוואטסאפ.', '⛺ שליחת הודעה לצוות התנועה'],
    } as const;
    for (const org of ['school', 'company', 'youth'] as const) {
      const [message, subtitle, cta] = NEUTRAL[org];
      expect(t(`outreach.${org}.message`, { orgName: '${orgName}', gender: 'other' })).toBe(message);
      expect(t(`outreach.${org}.subtitle`, { gender: 'other' })).toBe(subtitle);
      expect(t(`outreach.${org}.cta`, { gender: 'other' })).toBe(cta);
    }
  });

  it('WorkoutGoalEditor title (rich: the hint is muted)', () => {
    expect(t.rich('goalEditor.title', { muted: (c: unknown) => `[${String(c)}]` }).join('')).toBe('יעד אימון [(ברירת מחדל לכל משתתף)]');
  });
});
