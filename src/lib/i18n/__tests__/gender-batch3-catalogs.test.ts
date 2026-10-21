/**
 * Gender copy batch 3, part 2 (owner decisions 21.10.2026): masculine-only catalog keys outside onboarding
 * (map exercise cues, library search hints, community create-group / page / invite keys).
 *
 * GENDERED rows — [id, values, male (old text, byte-identical), female (new), neutral (new; also no gender)].
 * NOUN / PLURAL rows — [id, values, old text, new text]: the same for everyone — one-word buttons and
 * placeholders became nouns (decision 2), texts users send to friends became plural "בואו" (decision 7).
 */
import { describe, expect, it } from 'vitest';
import { makeT } from '@/lib/i18n/t';
import { map } from '@/messages/ns/map';
import { library } from '@/messages/ns/library';
import { community } from '@/messages/ns/community';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';

type T = (key: string, values?: MessageValues) => string;
const T_BY_NS: Record<string, T> = {
  map: makeT('he', map) as unknown as T,
  library: makeT('he', library) as unknown as T,
  community: makeT('he', community) as unknown as T,
};
const tr = (id: string, values: MessageValues) => {
  const [ns, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  return T_BY_NS[ns](key, values);
};

const GENDERED: Array<[string, Record<string, string>, string, string, string]> = [
  ["map:equipment.autoCue.chest.1", {}, "שמור על שכמות סגורות לאורך כל התנועה", "שמרי על שכמות סגורות לאורך כל התנועה", "שומרים על שכמות סגורות לאורך כל התנועה"],
  ["map:equipment.autoCue.chest.2", {}, "הורד את הגוף בקצב מבוקר ועלה במלוא הטווח", "הורידי את הגוף בקצב מבוקר ועלי במלוא הטווח", "מורידים את הגוף בקצב מבוקר ועולים במלוא הטווח"],
  ["map:equipment.autoCue.back.1", {}, "התחל את המשיכה משכמות, לא ממרפקים", "התחילי את המשיכה משכמות, לא ממרפקים", "מתחילים את המשיכה משכמות, לא ממרפקים"],
  ["map:equipment.autoCue.back.2", {}, "שמור על ליבה אסופה — אל תקשת את הגב התחתון", "שמרי על ליבה אסופה — אל תקשתי את הגב התחתון", "שומרים על ליבה אסופה — בלי לקשת את הגב התחתון"],
  ["map:equipment.autoCue.shoulders.1", {}, "ייצב את שרירי הליבה לפני כל חזרה", "ייצבי את שרירי הליבה לפני כל חזרה", "מייצבים את שרירי הליבה לפני כל חזרה"],
  ["map:equipment.autoCue.shoulders.2", {}, "אל תיכנס לטווח כואב — עצור איפה שזה מרגיש בשליטה", "אל תיכנסי לטווח כואב — עצרי איפה שזה מרגיש בשליטה", "לא נכנסים לטווח כואב — עוצרים איפה שזה מרגיש בשליטה"],
  ["map:equipment.autoCue.biceps.1", {}, "הצמד את המרפקים לגוף — אל תפתח אותם החוצה", "הצמידי את המרפקים לגוף — אל תפתחי אותם החוצה", "מצמידים את המרפקים לגוף — לא פותחים אותם החוצה"],
  ["map:equipment.autoCue.biceps.2", {}, "נשוף בעת המשיכה, שאף בירידה", "נשפי בעת המשיכה, שאפי בירידה", "נושפים בעת המשיכה, שואפים בירידה"],
  ["map:equipment.autoCue.triceps.1", {}, "שמור על המרפקים קרוב לגוף לאורך כל התנועה", "שמרי על המרפקים קרוב לגוף לאורך כל התנועה", "שומרים על המרפקים קרוב לגוף לאורך כל התנועה"],
  ["map:equipment.autoCue.triceps.2", {}, "נצל את מלוא הטווח — יישור מלא בקצה החזרה", "נצלי את מלוא הטווח — יישור מלא בקצה החזרה", "מנצלים את מלוא הטווח — יישור מלא בקצה החזרה"],
  ["map:equipment.autoCue.abs.1", {}, "שמור על נשימה רציפה — אל תעצור את האוויר", "שמרי על נשימה רציפה — אל תעצרי את האוויר", "שומרים על נשימה רציפה — בלי לעצור את האוויר"],
  ["map:equipment.autoCue.abs.2", {}, "רכז את הכיווץ בבטן, לא בכתפיים", "רכזי את הכיווץ בבטן, לא בכתפיים", "מרכזים את הכיווץ בבטן, לא בכתפיים"],
  ["map:equipment.autoCue.core.1", {}, "שמור על נשימה רציפה — אל תעצור את האוויר", "שמרי על נשימה רציפה — אל תעצרי את האוויר", "שומרים על נשימה רציפה — בלי לעצור את האוויר"],
  ["map:equipment.autoCue.core.2", {}, "רכז את הכיווץ בבטן, לא בכתפיים", "רכזי את הכיווץ בבטן, לא בכתפיים", "מרכזים את הכיווץ בבטן, לא בכתפיים"],
  ["map:equipment.autoCue.obliques.2", {}, "שמור על אגן יציב — תוריד את הקצב לטובת איכות", "שמרי על אגן יציב — תורידי את הקצב לטובת איכות", "שומרים על אגן יציב — מורידים את הקצב לטובת איכות"],
  ["map:equipment.autoCue.quads.2", {}, "הורד עד 90° לפחות, שמור על משקל באמצע כף הרגל", "הורידי עד 90° לפחות, שמרי על משקל באמצע כף הרגל", "יורדים עד 90° לפחות, שומרים על משקל באמצע כף הרגל"],
  ["map:equipment.autoCue.hamstrings.2", {}, "שמור על גב ניטרלי, אגן נעול", "שמרי על גב ניטרלי, אגן נעול", "שומרים על גב ניטרלי, אגן נעול"],
  ["map:equipment.autoCue.glutes.1", {}, "דחוף דרך העקבים, לא דרך אצבעות", "דחפי דרך העקבים, לא דרך אצבעות", "דוחפים דרך העקבים, לא דרך אצבעות"],
  ["map:equipment.autoCue.glutes.2", {}, "נעל את האגן בנקודת השיא — סחיטה מלאה", "נעלי את האגן בנקודת השיא — סחיטה מלאה", "נועלים את האגן בנקודת השיא — סחיטה מלאה"],
  ["map:equipment.autoCue.calves.2", {}, "אל תקפיץ — תאים בכל חזרה", "אל תקפיצי — תאים בכל חזרה", "בלי להקפיץ — תאים בכל חזרה"],
  ["map:equipment.autoCue.fullBody.1", {}, "התחל בקצב מבוקר עד שאתה מרגיש את הטכניקה", "התחילי בקצב מבוקר עד שאת מרגישה את הטכניקה", "מתחילים בקצב מבוקר עד שמרגישים את הטכניקה"],
  ["map:equipment.autoCue.fullBody.2", {}, "נשוף במאמץ, שאף בשלב הקל", "נשפי במאמץ, שאפי בשלב הקל", "נושפים במאמץ, שואפים בשלב הקל"],
  ["map:equipment.autoCue.legs.1", {}, "שמור על משקל באמצע כף הרגל לאורך כל החזרה", "שמרי על משקל באמצע כף הרגל לאורך כל החזרה", "שומרים על משקל באמצע כף הרגל לאורך כל החזרה"],
  ["map:equipment.autoCue.legs.2", {}, "אל תקרוס פנימה בברכיים — דחוף החוצה במכוון", "אל תקרסי פנימה בברכיים — דחפי החוצה במכוון", "לא קורסים פנימה בברכיים — דוחפים החוצה במכוון"],
  ["map:equipment.autoCue.generic.1", {}, "שמור על תנועה מבוקרת — אין צורך להאיץ", "שמרי על תנועה מבוקרת — אין צורך להאיץ", "שומרים על תנועה מבוקרת — אין צורך להאיץ"],
  ["map:equipment.autoCue.generic.2", {}, "רכז כל חזרה בשריר היעד, לא בתאוצה", "רכזי כל חזרה בשריר היעד, לא בתאוצה", "מרכזים כל חזרה בשריר היעד, לא בתאוצה"],
  ["library:search.legacy.partners.empty.body", {}, "עקוב אחרי משתמשים בלשונית \"גלה אנשים\" או הזמן חברים שעדיין לא באפליקציה", "עקבי אחרי משתמשים בלשונית \"גלה אנשים\" או הזמיני חברים שעדיין לא באפליקציה", "אפשר לעקוב אחרי משתמשים בלשונית \"גלה אנשים\" או להזמין חברים שעדיין לא באפליקציה"],
  ["library:search.legacy.people.none.body", {}, "נסה שם אחר", "נסי שם אחר", "נסו שם אחר"],
  ["library:exercises.noResults.hint", {}, "נסה להסיר חלק מהמסננים", "נסי להסיר חלק מהמסננים", "אפשר להסיר חלק מהמסננים"],
  ["community:postJoin.subtitle", {"verb":"ירוץ"}, "הזמן שותף שירוץ איתך!", "הזמיני שותף שירוץ איתך!", "מזמינים שותף שירוץ איתך!"],
  ["community:createGroup.basics.descriptionPlaceholder", {}, "ספר על הקבוצה שלך — מה עושים, מי מוזמן, מה האווירה...", "ספרי על הקבוצה שלך — מה עושים, מי מוזמן, מה האווירה...", "כמה מילים על הקבוצה — מה עושים, מי מוזמן, מה האווירה..."],
  ["community:createGroup.whenWhere.pinPrompt", {}, "או לחץ על המפה לסימון מיקום", "או לחצי על המפה לסימון מיקום", "או לוחצים על המפה לסימון מיקום"],
  ["community:createGroup.whenWhere.pinHint", {}, "לחץ על המפה כדי לדייק את הפין", "לחצי על המפה כדי לדייק את הפין", "לוחצים על המפה כדי לדייק את הפין"],
  ["community:createGroup.success.privateMessage", {}, "שתף את קוד ההצטרפות הסודי עם המתאמנים שלך:", "שתפי את קוד ההצטרפות הסודי עם המתאמנים שלך:", "משתפים את קוד ההצטרפות הסודי עם המתאמנים שלך:"],
  ["community:createGroup.error.save", {}, "שמירת השינויים נכשלה. נסה שוב.", "שמירת השינויים נכשלה. נסי שוב.", "שמירת השינויים נכשלה. נסו שוב."],
  ["community:createGroup.error.create", {}, "יצירת הקבוצה נכשלה. נסה שוב.", "יצירת הקבוצה נכשלה. נסי שוב.", "יצירת הקבוצה נכשלה. נסו שוב."],
  ["community:communityPage.feed.empty.body", {}, "סיים אימון כדי לפרסם את הפוסט הראשון שלך, או חפש שותפים ועקוב אחריהם", "סיימי אימון כדי לפרסם את הפוסט הראשון שלך, או חפשי שותפים ועקבי אחריהם", "מסיימים אימון כדי לפרסם את הפוסט הראשון, או מחפשים שותפים ועוקבים אחריהם"],
  ["community:communityPage.setup.title", {}, "בחר שכונה כדי להצטרף לליגת השכונה", "בחרי שכונה כדי להצטרף לליגת השכונה", "בוחרים שכונה כדי להצטרף לליגת השכונה"],
];

const SAME_FOR_EVERYONE: Array<[string, Record<string, string>, string, string]> = [
  ["library:search.placeholder.exercises", {}, "חפש תרגיל...", "חיפוש תרגיל..."],
  ["library:search.placeholder.articles", {}, "חפש מאמר", "חיפוש מאמר"],
  ["library:search.legacy.placeholder.exercises", {}, "חפש תרגיל...", "חיפוש תרגיל..."],
  ["library:search.legacy.placeholder.events", {}, "חפש אירוע...", "חיפוש אירוע..."],
  ["library:search.legacy.placeholder.groups", {}, "חפש קבוצה...", "חיפוש קבוצה..."],
  ["library:search.legacy.placeholder.people", {}, "חפש לפי שם...", "חיפוש לפי שם..."],
  ["library:search.legacy.invite", {}, "הזמן חברים", "הזמנת חברים"],
  ["library:search.legacy.partners.empty.invite", {}, "הזמן חברים", "הזמנת חברים"],
  ["community:group.invite.shareText", {"groupName":"רצי הירקון","code":"AB12","link":"https://x.co/j/AB12"}, "הוזמנת להצטרף לקהילה \"רצי הירקון\"! השתמש בקוד: AB12\nאו לחץ על הקישור: https://x.co/j/AB12", "הוזמנתם להצטרף לקהילה \"רצי הירקון\"! השתמשו בקוד: AB12\nאו בקישור: https://x.co/j/AB12"],
  ["community:group.invite.whatsapp", {}, "הזמן חברים בוואטסאפ", "הזמנת חברים בוואטסאפ"],
  ["community:postJoin.invite", {}, "הזמן שותף/ה", "הזמנת שותפים"],
  ["community:social.partner.follow", {}, "עקוב", "מעקב"],
  ["community:createGroup.outreach.send", {"org":"work"}, "שלח הודעה לHR / מנהל ישיר", "שליחת הודעה לHR / מנהל ישיר"],
  ["community:createGroup.whenWhere.searchLabel", {}, "חפש כתובת, פארק או מקום", "חיפוש כתובת, פארק או מקום"],
  ["community:createGroup.whenWhere.parksLabel", {}, "בחר מפארקים עירוניים", "בחירה מפארקים עירוניים"],
  ["community:createGroup.slots.add", {}, "הוסף", "הוספה"],
  ["community:createGroup.finalize.imageCta", {}, "לחץ להוספת תמונה", "הוספת תמונה"],
  ["community:createGroup.success.whatsapp", {}, "שתף בוואטסאפ", "שיתוף בוואטסאפ"],
  ["community:createGroup.success.shareText", {"name":"רצים","inviteCode":"AB12","link":"https://x.co/j/AB12"}, "היי! הקמתי קהילה חדשה \"רצים\" — בוא להצטרף! 🏃\nקוד הצטרפות: AB12\nhttps://x.co/j/AB12", "היי! הקמתי קהילה חדשה \"רצים\" — בואו להצטרף! 🏃\nקוד הצטרפות: AB12\nhttps://x.co/j/AB12"],
  ["community:communityPage.feed.empty.findPartners", {}, "מצא שותפים", "חיפוש שותפים"],
  ["community:communityPage.setup.cta", {}, "בחר שכונה בפרופיל", "בחירת שכונה בפרופיל"],
  ["community:communityPage.invite.shareText", {"scope":"נווה שאנן"}, "בוא תצטרף אליי בנווה שאנן על Out! 🔥", "בואו להצטרף אליי בנווה שאנן על Out! 🔥"],
  ["community:communityPage.invite.title", {"scope":"נווה שאנן"}, "הזמן שכנים לנווה שאנן", "הזמנת שכנים לנווה שאנן"],
  ["community:communityPage.axis.hint", {}, "לחץ להחלפת ציר", "הקשה להחלפת ציר"],
  ["community:communityPage.axis.hintInCity", {"city":"חיפה"}, "בחיפה · לחץ להחלפת ציר", "בחיפה · הקשה להחלפת ציר"],
];

describe('gender batch 3 — catalogs outside onboarding', () => {
  it.each(GENDERED)('%s: male unchanged, female, neutral', (id, values, male, female, neutral) => {
    expect(tr(id, { ...values, gender: 'male' })).toBe(male);
    expect(tr(id, { ...values, gender: 'female' })).toBe(female);
    expect(tr(id, { ...values, gender: 'other' })).toBe(neutral);
    expect(tr(id, { ...values })).toBe(neutral);
    expect(neutral).not.toMatch(/\S\/\S/);
  });

  it.each(SAME_FOR_EVERYONE)('%s: noun / plural for everyone', (id, values, old, next) => {
    expect(next).not.toBe(old);
    for (const gender of ['male', 'female', 'other', undefined]) expect(tr(id, { ...values, gender })).toBe(next);
  });
});
