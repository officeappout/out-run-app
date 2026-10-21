/**
 * Namespace `community` (i18n wave 2, the group page — `group.*` keys): every Hebrew key returns
 * exactly what the code rendered before the extraction. The `old` side of each case is the original
 * literal / template expression, copied verbatim from src/features/arena/components/group-details.
 *
 * The parity snapshots (group-details/__tests__/group-details-i18n-parity.test.tsx) cover the keys in
 * context; this test also pins every select / plural branch and counts ≥ 1000 (no thousands separator).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/community.json';
import { community } from '@/messages/ns/community';
import { makeT } from '../t';

const t = makeT('he', community);
type Key = keyof typeof he;

describe('community (he) group.* — byte-identical to the pre-extraction literals', () => {
  it('owns exactly the group.* keys this test pins (count per prefix, not the namespace total)', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('group.')).length).toBe(105);
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ["group.hero.close", "סגור מגירה"],
      ["group.next.title", "המפגש הבא"],
      ["group.next.full", " · המפגש מלא"],
      ["group.next.booked", "✓ רשום/ה (בטל?)"],
      ["group.next.waitlisted", "⏳ ברשימת המתנה (בטל?)"],
      ["group.next.joinWaitlist", "הצטרפות לרשימת המתנה"],
      ["group.next.book", "הרשמה למפגש"],
      ["group.next.hideSchedule", "הסתר מערכת שעות"],
      ["group.next.showSchedule", "לכל מערכת השעות"],
      ["group.schedule.title", "מערכת שעות מלאה"],
      ["group.schedule.next", "הבא"],
      ["group.who.title", "מי מגיע"],
      ["group.who.tab.next", "המפגש הבא"],
      ["group.who.tab.week", "השבוע"],
      ["group.who.next.none", "עוד אין רשומים"],
      ["group.who.next.beFirst", "אין רשומים עדיין — היה/י הראשון/ה!"],
      ["group.who.next.noSession", "אין מפגש מתוכנן"],
      ["group.who.week.empty", "אין מפגשים נוספים השבוע"],
      ["group.who.week.none", "אין רשומים עדיין"],
      ["group.members.title", "חברי הקהילה"],
      ["group.members.owner", "בעלים"],
      ["group.members.admin", "מנהל/ת"],
      ["group.members.promote", "הפוך למנהל"],
      ["group.members.promoteHint", "אותן סמכויות כמו שלך"],
      ["group.members.demote", "הסר ניהול"],
      ["group.members.remove", "הסר מהקבוצה"],
      ["group.removeMember.title", "הסרת חבר/ה"],
      ["group.removeMember.note", "המשתמש יוסר מהקבוצה ומהצ׳אט"],
      ["group.removeMember.confirm", "הסרה"],
      ["group.removeMember.cancel", "ביטול"],
      ["group.live.cityOnlyNoAddress", "מפגש פעיל · לתושבי העיר בלבד"],
      ["group.live.membersOnly", "מפגש פעיל · לחברים בלבד"],
      ["group.location.openMapNoAddress", "פתיחת מפה למיקום הקבוצה"],
      ["group.location.mapAlt", "מפה"],
      ["group.location.military", "הפרטים מיועדים למילואימניקים."],
      ["group.join.enterCode", "קוד הצטרפות"],
      ["group.join.privateHint", "זו קהילה פרטית — הזינו את קוד ההצטרפות:"],
      ["group.join.codeLabel", "קוד הצטרפות לקהילה"],
      ["group.join.submit", "אישור"],
      ["group.join.wrongCode", "קוד שגוי, אנא נסו שנית"],
      ["group.join.cancel", "ביטול"],
      ["group.join.join", "הצטרפות לקבוצה"],
      ["group.join.register", "הרשמה"],
      ["group.join.toast.wrongTenant", "הקוד אינו שייך לקבוצה הזו."],
      ["group.dropIn.title", "כל הכבוד, הצטרפת לאימון!"],
      ["group.dropIn.subtitle", "רוצה לקבל תזכורות למפגשים הבאים?"],
      ["group.dropIn.later", "אולי אחר כך"],
      ["group.rules.title", "כללי הקהילה"],
      ["group.invite.title", "קוד הזמנה"],
      ["group.invite.copied", "הקוד הועתק"],
      ["group.invite.copy", "העתק קוד הזמנה"],
      ["group.invite.whatsapp", "הזמן חברים בוואטסאפ"],
      ["group.share.label", "שיתוף הקבוצה"],
      ["group.share.share", "שיתוף"],
      ["group.share.calendar", "ליומן"],
      ["group.membership.chat", "כנס לצ'אט הקהילה"],
      ["group.membership.leave", "עזוב קבוצה"],
      ["group.membership.leaveConfirm", "בטוח/ה? המפגשים יוסרו מלוז האימונים ומהיומן"],
      ["group.membership.leaveYes", "כן, עזוב"],
      ["group.membership.cancel", "ביטול"],
      ["group.organizer.edit", "עריכת הקהילה"],
      ["group.organizer.manageSchedule", "ניהול מפגשים"],
      ["group.scheduleManager.title", "ניהול מפגשים"],
      ["group.scheduleManager.active", "פעיל"],
      ["group.scheduleManager.editLocked", "מפגש פעיל כרגע — לא ניתן לערוך"],
      ["group.scheduleManager.edit", "עריכה"],
      ["group.scheduleManager.removeOnly", "להפסיק מפגשים לגמרי — בקרוב"],
      ["group.scheduleManager.removeLocked", "מפגש פעיל כרגע"],
      ["group.scheduleManager.remove", "הסר מפגש"],
      ["group.scheduleManager.add", "הוספת מפגש"],
      ["group.scheduleManager.toast.removed", "מפגש הוסר"],
      ["group.scheduleManager.toast.saveError", "שגיאה בשמירה"],
      ["group.slotEditor.titleEdit", "עריכת מפגש"],
      ["group.slotEditor.titleAdd", "הוספת מפגש"],
      ["group.slotEditor.day", "יום בשבוע"],
      ["group.slotEditor.time", "שעה"],
      ["group.slotEditor.location", "מיקום"],
      ["group.slotEditor.saving", "שומר..."],
      ["group.slotEditor.save", "שמירת שינויים"],
      ["group.slotEditor.add", "הוספת מפגש"],
      ["group.slotEditor.toast.badTime", "שעה לא תקינה"],
      ["group.slotEditor.toast.updated", "המפגש עודכן"],
      ["group.slotEditor.toast.added", "מפגש נוסף"],
      ["group.slotEditor.toast.saveError", "שגיאה בשמירה"],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('values, selects, plurals', () => {
    const name = 'רצי הירקון';
    const time = '18:00';
    // formatSessionDate
    expect(t('group.session.today', { time })).toBe(`היום ב-${time}`);
    expect(t('group.session.tomorrow', { time })).toBe(`מחר ב-${time}`);
    // Owner copy fix (21.10.2026): the weekday name already starts with "יום" — no doubled "יום יום".
    expect(t('group.session.weekday', { day: 'יום רביעי', time })).toBe(`יום רביעי ב-${time}`);
    // NextSessionCard
    for (const spotsLeft of [0, 2, 1234]) {
      expect(t('group.next.spotsLeft', { count: String(spotsLeft) })).toBe(` · ${spotsLeft} מקומות נותרו`);
    }
    for (const goal of [{ type: 'distance', value: 5 }, { type: 'distance', value: 12.34 }, { type: 'duration', value: 1800 }, { type: 'time', value: 90 }]) {
      const old = goal.type === 'distance' ? `${goal.value.toFixed(1)} ק״מ` : `${Math.round(goal.value / 60)} דק׳`;
      const value = goal.type === 'distance' ? goal.value.toFixed(1) : String(Math.round(goal.value / 60));
      expect(t('group.next.goal', { type: goal.type, value })).toBe(`🎯 יעד אישי · ${old}`);
    }
    expect(t('group.next.goal', { type: '', value: '3' })).toBe('🎯 יעד אישי · 3 דק׳');
    // FullScheduleList
    for (const day of ['א׳', 'ש׳']) expect(t('group.schedule.slot', { day, time })).toBe(`יום ${day} ב-${time}`);
    // WhoNextTab / WhoWeekTab / ScheduleManagerPanel
    for (const n of [1, 2, 3, 1234]) {
      expect(t('group.who.next.coming', { count: String(n) })).toBe(`${n} מגיעים`);
      expect(t('group.who.next.waiting', { count: String(n) })).toBe(` · ${n} בהמתנה`);
      expect(t('group.who.next.registered', { n, count: String(n) })).toBe(`${n} ${n === 1 ? 'נרשם/ה' : 'נרשמו'}`);
      expect(t('group.who.next.waitlist', { count: String(n) })).toBe(`${n} ברשימת המתנה`);
      expect(t('group.who.week.registered', { count: String(n) })).toBe(`${n} נרשמו`);
      expect(t('group.scheduleManager.registered', { count: String(n) })).toBe(`${n} נרשמו`);
    }
    // GroupMemberRow
    expect(t('group.members.actions', { name: 'מיכל' })).toBe(`${'מיכל'} · פעולות מנהל`);
    // RemoveMemberModal (rich: the name is bold)
    expect(t.rich('group.removeMember.question', { name: 'מיכל', b: (c: unknown) => `[${String(c)}]` }).join('')).toBe('האם להסיר את [מיכל] מהקהילה?');
    // GroupLiveBanner — old: `מפגש פעיל ·{' '}` + (isCityOnly ? `לתושבי ${destAddress?.split(',')[0] ?? 'העיר'} בלבד` : 'לחברים בלבד')
    const live = (isCityOnly: boolean, destAddress: string | undefined) =>
      `מפגש פעיל ${'·'} ${isCityOnly ? `לתושבי ${destAddress?.split(',')[0] ?? 'העיר'} בלבד` : 'לחברים בלבד'}`;
    expect(t('group.live.cityOnly', { city: 'רמת גן, מרכז'.split(',')[0] })).toBe(live(true, 'רמת גן, מרכז'));
    expect(t('group.live.cityOnly', { city: '' })).toBe(live(true, ''));
    expect(t('group.live.cityOnlyNoAddress')).toBe(live(true, undefined));
    expect(t('group.live.membersOnly')).toBe(live(false, 'x'));
    // GroupLocationCard — old aria: `פתח מפה ל-${destAddress || 'מיקום הקבוצה'}`
    expect(t('group.location.openMap', { address: 'נמל תל אביב' })).toBe(`פתיחת מפה ל-${'נמל תל אביב'}`);
    expect(t('group.location.openMapNoAddress')).toBe('פתיחת מפה למיקום הקבוצה');
    // StartScheduledRunButton — old: activity === 'walking' ? 'צא להליכה' : 'צא לריצה'
    for (const activity of ['walking', 'running', ''] as const) {
      expect(t('group.run.start', { activity })).toBe(activity === 'walking' ? 'צא להליכה' : 'צא לריצה');
    }
    // Share texts
    const groupName = "רצי 'הירקון' {x}";
    for (const categoryLabel of ['ריצה', 'יוגה']) {
      expect(t('group.share.text', { category: categoryLabel, groupName })).toBe(`מצאתי קבוצת ${categoryLabel} מעולה: \'${groupName}\'! בואו להצטרף אלינו.`);
    }
    const code = 'ABC123';
    const link = `https://example.com/join/${code}`;
    expect(t('group.invite.shareText', { groupName, code, link })).toBe(`הוזמנת להצטרף לקהילה "${groupName}"! השתמש בקוד: ${code}\nאו לחץ על הקישור: ${link}`);
    // useGroupJoinActions toast
    expect(t('group.join.toast.welcome', { name })).toBe(`ברוכים הבאים ל${name}!`);
  });
});

describe('owner copy fixes (21.10.2026)', () => {
  it('drop-in join follows the gender', () => {
    expect(t('group.dropIn.join', { gender: 'female' })).toBe('כן, הצטרפי לקבוצה');
    expect(t('group.dropIn.join', { gender: 'male' })).toBe('כן, הצטרף לקבוצה');
    expect(t('group.dropIn.join', { gender: 'other' })).toBe('כן, מצטרפים לקבוצה'); // gender batch 2: other = neutral
  });
});
