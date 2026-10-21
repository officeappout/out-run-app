/**
 * Namespace `community`, prefix `createGroup.*` (i18n wave 2, the create-group wizard in
 * src/features/arena/components/create-group-wizard): every Hebrew key returns exactly what the code
 * rendered before the extraction. The `old` side of each case is the original literal / template
 * (or the old helper / ternary, re-declared verbatim), copied from the pre-extraction files.
 *
 * The parity snapshots (src/features/arena/components/__tests__/create-group-wizard-i18n-parity.test.tsx)
 * cover the keys in context; this test also pins every select / gender branch (incl. a non-standard
 * gender), the outreach texts per org type, the submit errors and the WhatsApp share texts (behind a
 * tap / async — a static render can't reach them).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/community.json';
import { community } from '@/messages/ns/community';
import { makeT } from '../t';

const t = makeT('he', community);
type Key = keyof typeof he;

describe('community (he) create-group wizard — byte-identical to the pre-extraction literals', () => {
  it('owns exactly the keys this test pins (count per prefix, not the namespace total)', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('createGroup.')).length).toBe(112);
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['createGroup.step.type', 'סוג קבוצה'],
      ['createGroup.step.basics', 'בסיסים'],
      ['createGroup.step.mode', 'סוג אימון'],
      ['createGroup.step.whenWhere', 'מתי ואיפה'],
      ['createGroup.step.privacy', 'פרטיות'],
      ['createGroup.step.finalize', 'סיום'],
      ['createGroup.category.running', 'ריצה'],
      ['createGroup.category.walking', 'הליכה'],
      ['createGroup.category.calisthenics', 'קליסתניקס'],
      ['createGroup.category.yoga', 'יוגה'],
      ['createGroup.category.cycling', 'רכיבה'],
      ['createGroup.category.other', 'אחר'],
      ['createGroup.groupType.neighborhood.label', 'שכונה'],
      ['createGroup.groupType.neighborhood.sub', 'קבוצת אימון מקומית'],
      ['createGroup.groupType.friends.label', 'חברים'],
      ['createGroup.groupType.friends.sub', 'קבוצה פרטית לחברים'],
      ['createGroup.groupType.family.label', 'משפחה'],
      ['createGroup.groupType.family.sub', 'אתגר משפחתי'],
      ['createGroup.groupType.work.label', 'עבודה'],
      ['createGroup.groupType.work.sub', 'אתגר ספורט בעבודה'],
      ['createGroup.groupType.university.label', 'קמפוס'],
      ['createGroup.groupType.university.sub', 'קהילת סטודנטים'],
      ['createGroup.groupType.park.label', 'פארק'],
      ['createGroup.groupType.park.sub', 'קהילת פארק'],
      ['createGroup.groupType.school.label', 'ביה״ס'],
      ['createGroup.groupType.school.sub', 'קהילת בית ספר'],
      ['createGroup.type.question', 'איזו קהילה פותחים?'],
      ['createGroup.type.privateDefault', 'פרטית כברירת מחדל — אפשר לשנות בשלב הפרטיות'],
      ['createGroup.basics.nameLabel', 'שם הקבוצה *'],
      ['createGroup.basics.category', 'קטגוריה'],
      ['createGroup.basics.categoryOptional', 'קטגוריה (אופציונלי)'],
      ['createGroup.basics.descriptionLabel', 'תיאור קצר'],
      // createGroup.basics.descriptionPlaceholder: gendered since gender batch 3 — gender-batch3-catalogs.test.ts
      ['createGroup.mode.question', 'איך הקהילה שלך מתאמנת ביחד?'],
      ['createGroup.mode.together.label', 'אימון משותף'],
      ['createGroup.mode.together.sub', 'מפגשים קבועים בזמן ומקום — הקבוצה מתאמנת ביחד'],
      ['createGroup.mode.ownPace.label', 'כל אחד בקצב שלו'],
      ['createGroup.mode.ownPace.sub', 'ליגה, אתגר או תחרות — כל אחד מתאמן ומדווח תוצאות'],
      ['createGroup.outreach.how', 'איך זה עובד?'],
      ['createGroup.outreach.howStep2', 'הם יצרו קשר עם Out'],
      ['createGroup.outreach.sent', 'נשלח! תודה'],
      ['createGroup.outreach.continueSent', 'המשך ליצירת הקבוצה'],
      ['createGroup.outreach.continueUnsent', 'המשך בלי לשלוח'],
      ['createGroup.privacy.label', 'פרטיות'],
      ['createGroup.privacy.defaultBadge', 'ברירת-מחדל פרטי'],
      ['createGroup.privacy.public.label', 'ציבורי'],
      ['createGroup.privacy.public.sub', 'כולם יכולים להצטרף'],
      ['createGroup.privacy.private.label', 'פרטי'],
      ['createGroup.privacy.private.sub', 'הצטרפות בקוד הזמנה'],
      ['createGroup.privacy.joinRequestsLabel', 'אפשר לבקש להצטרף?'],
      ['createGroup.privacy.joinYes.label', 'כן'],
      ['createGroup.privacy.joinYes.sub', 'אנשים יכולים לשלוח בקשה'],
      ['createGroup.privacy.joinNo.label', 'לא'],
      ['createGroup.privacy.joinNo.sub', 'הצטרפות בקוד הזמנה בלבד'],
      ['createGroup.privacy.rulesLabel', 'כללי הקהילה (אופציונלי)'],
      ['createGroup.privacy.rulesPlaceholder', 'לדוגמה:\n• נא להגיע עם מים\n• כבוד הדדי\n• מוזמן לשתף חברים'],
      ['createGroup.whenWhere.searchLabel', 'חיפוש כתובת, פארק או מקום'], // gender batch 3 (was: חפש כתובת, פארק או מקום)
      ['createGroup.whenWhere.parksLabel', 'בחירה מפארקים עירוניים'], // gender batch 3 (was: בחר מפארקים עירוניים)
      ['createGroup.whenWhere.noParks', 'לא נמצאו פארקים עירוניים'],
      ['createGroup.whenWhere.noAuthority', 'הרשאת עיר לא מוגדרת'],
      ['createGroup.whenWhere.pinFineTune', 'כיוון עדין על המפה'],
      // createGroup.whenWhere.pinPrompt: gendered since gender batch 3 — gender-batch3-catalogs.test.ts
      // createGroup.whenWhere.pinHint: gendered since gender batch 3 — gender-batch3-catalogs.test.ts
      ['createGroup.slots.dayLabel', 'יום בשבוע'],
      ['createGroup.slots.timeLabel', 'שעה'],
      ['createGroup.slots.add', 'הוספה'], // gender batch 3 (was: הוסף)
      ['createGroup.slots.chosenLabel', 'מועדים שנבחרו'],
      ['createGroup.slots.remove', 'הסרת המועד'],
      ['createGroup.slots.empty', 'ניתן להמשיך ללא לוח זמנים ולעדכן מאוחר יותר'],
      ['createGroup.finalize.imageLabel', 'תמונת כותרת (אופציונלי)'],
      ['createGroup.finalize.imageAlt', 'תצוגה מקדימה'],
      ['createGroup.finalize.imageCta', 'הוספת תמונה'], // gender batch 3 (was: לחץ להוספת תמונה)
      ['createGroup.finalize.summaryTitle', 'סיכום'],
      ['createGroup.finalize.summary.name', 'שם'],
      ['createGroup.finalize.summary.category', 'קטגוריה'],
      ['createGroup.finalize.summary.location', 'מיקום'],
      ['createGroup.finalize.summary.noLocation', 'לא נבחר מיקום'],
      ['createGroup.finalize.summary.meetings', 'מפגשים'],
      ['createGroup.finalize.summary.meetingsNone', 'לא הוגדרו'],
      ['createGroup.finalize.summary.privacy', 'פרטיות'],
      ['createGroup.finalize.summary.public', 'ציבורי'],
      ['createGroup.finalize.summary.private', 'פרטי'],
      ['createGroup.header.success', 'הקהילה שלך באוויר!'],
      ['createGroup.header.close', 'סגירה'],
      ['createGroup.header.outreachStep', 'פנייה לארגון'],
      ['createGroup.footer.back', 'חזרה'],
      ['createGroup.footer.next', 'המשך'],
      ['createGroup.footer.nextOutreach', 'המשך ליצירה'],
      ['createGroup.footer.locationHint', 'יש לבחור מיקום כדי להמשיך'],
      // createGroup.success.privateMessage: gendered since gender batch 3 — gender-batch3-catalogs.test.ts
      ['createGroup.success.publicMessage', 'הקהילה שלך פתוחה וממתינה לחברים הראשונים!'],
      ['createGroup.success.codeLabel', 'קוד הצטרפות'],
      ['createGroup.success.copied', 'הועתק!'],
      ['createGroup.success.copy', 'העתק קוד'],
      ['createGroup.success.whatsapp', 'שיתוף בוואטסאפ'], // gender batch 3 (was: שתף בוואטסאפ)
      ['createGroup.success.enter', 'כניסה לקהילה'],
      // createGroup.error.save: gendered since gender batch 3 — gender-batch3-catalogs.test.ts
      // createGroup.error.create: gendered since gender batch 3 — gender-batch3-catalogs.test.ts
    ];
    for (const [key, old] of cases) expect([key, t(key)]).toEqual([key, old]);
  });

  it('name placeholder — the old groupType ternary, every branch', () => {
    const old = (groupType: string) =>
      groupType === 'family' ? 'לדוגמה: אתגר ריצה משפחת כהן' :
      groupType === 'friends' ? 'לדוגמה: חברים רצים ביחד' :
      'לדוגמה: קבוצת ריצה שכונתית';
    for (const groupType of ['family', 'friends', 'neighborhood', 'work', 'university', 'park', 'school', 'military', ''])
      expect(t('createGroup.basics.namePlaceholder', { groupType })).toBe(old(groupType));
  });

  it('outreach texts — work vs campus (the old isWork ternaries)', () => {
    for (const groupType of ['work', 'university']) {
      const isWork = groupType === 'work';
      const org = isWork ? 'work' : 'other';
      const label = isWork ? 'מקום העבודה' : 'הקמפוס';
      const recipient = isWork ? 'HR / מנהל ישיר' : 'אגודת הסטודנטים';
      const orgLabel = isWork ? 'החברה' : 'הקמפוס';
      expect(t('createGroup.outreach.shareText', { org })).toBe(
        `היי, אני מתאמן/ת עם Out ורוצה להביא את הפלטפורמה ל${label} שלנו! Out זו ליגת כושר עירונית שמחברת אנשים לאימונים חכמים בחוץ. בואו נדבר!\n\nhttps://appout.co.il/`,
      );
      expect(t('createGroup.outreach.title', { org })).toBe(`רוצים ליגה רשמית ל${label}?`);
      expect(t('createGroup.outreach.body', { org })).toBe(
        `פנו ל${recipient} ובקשו שישתפו פעולה עם Out — ואנחנו נפתח את הליגה הרשמית!`,
      );
      expect(t('createGroup.outreach.howStep1', { org })).toBe(`שלחו את ההודעה ל${recipient}`);
      expect(t('createGroup.outreach.howStep3', { org })).toBe(`הליגה הרשמית של ${orgLabel} נפתחת!`);
      expect(t('createGroup.outreach.send', { org })).toBe(`שליחת הודעה ל${recipient}`); // gender batch 3: noun button
    }
  });

  it('gendered header / footer — the old t(male, female, gender) helper, incl. unset and non-standard', () => {
    const old = (male: string, female: string, gender?: string | null) => (gender === 'female' ? female : male);
    for (const myGender of ['female', 'male', null, undefined, 'other', 'x']) {
      const gender = myGender ?? 'other';
      expect(t('createGroup.header.edit', { gender })).toBe(old('ערוך קהילה', 'ערכי קהילה', myGender));
      expect(t('createGroup.header.create', { gender })).toBe(old('צור קהילה חדשה', 'צורי קהילה חדשה', myGender));
      expect(t('createGroup.footer.save', { gender })).toBe(old('שמור שינויים', 'שמרי שינויים', myGender));
      expect(t('createGroup.footer.create', { gender })).toBe(old('צור קהילה', 'צורי קהילה', myGender));
    }
  });

  it('values — slot line, meetings count (no thousands separator), share text', () => {
    const DAYS_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    for (const day of DAYS_FULL) expect(t('createGroup.slots.slot', { day, time: '18:30' })).toBe(`יום ${day} · 18:30`);
    for (const n of [1, 2, 1234]) expect(t('createGroup.finalize.summary.meetingsCount', { count: String(n) })).toBe(`${n} מועדים`);
    const name = 'רצים "בפארק" {x}';
    const inviteCode = 'AB12';
    const link = 'https://app.example/join/AB12';
    expect(t('createGroup.success.shareText', { name, inviteCode, link })).toBe(
      `היי! הקמתי קהילה חדשה "${name}" — בואו להצטרף! 🏃\nקוד הצטרפות: ${inviteCode}\n${link}`, // gender batch 3: בואו (decision 7)
    );
  });
});
