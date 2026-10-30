/**
 * i18n wave 2 batch ap (namespace `player`, `strengthPlayer.*`, `runShare.*`, `survey.*`, `xpStatus.*`) and
 * (namespace `summary`, `aerobic.*`, `hybrid.*`, `drawer.*`, `shell.*`, `page.*`): the Hebrew in the catalog must equal
 * the literal / template the component carried before the extraction (pasted verbatim). The component output itself is
 * pinned by the parity snapshots; this file covers what a static render can not reach (clicks, timers, async handlers,
 * every select / gender branch, counts >= 1000).
 */
import { describe, expect, it } from 'vitest';
import { player } from '@/messages/ns/player';
import { summary } from '@/messages/ns/summary';
import { common } from '@/messages/ns/common';
import { makeT } from '../t';
import { withUnit, unitLabel } from '../units';

const t = makeT('he', player);
const ts = makeT('he', summary);
const tc = makeT('he', common);

type PKey = Parameters<typeof t>[0];
const cases = (rows: Array<[PKey, string, Record<string, unknown>?]>) => {
  for (const [key, old, values] of rows) expect(t(key, values), key).toBe(old);
};

describe('strengthPlayer: rest, coach hint, entry, drawers', () => {
  it('plain strings', () => {
    cases([
      ['strengthPlayer.rest.next', 'התרגיל הבא'],
      ['strengthPlayer.rest.title', 'מנוחה'],
      ['strengthPlayer.rest.collapsePreview', 'כווץ תצוגה מקדימה'],
      ['strengthPlayer.rest.expandPreview', 'הרחב תצוגה מקדימה'],
      ['strengthPlayer.rest.muted', 'מושתק'],
      ['strengthPlayer.rest.mute', 'השתקה'],
      ['strengthPlayer.rest.skip', 'דלגו על המנוחה'],
      ['strengthPlayer.coachHint.fail.title', 'קשה מדי?'],
      ['strengthPlayer.coachHint.fail.text', 'תוכל/י להחליף לגרסה קלה יותר'],
      ['strengthPlayer.coachHint.over.title', 'קל מדי?'],
      ['strengthPlayer.coachHint.over.text', 'כל הכבוד! נתאים את האימון הבא'],
      ['strengthPlayer.coachHint.swap', 'החלפה'],
      ['strengthPlayer.coachHint.close', 'סגור'],
      ['strengthPlayer.dataEntry.title.time', 'כמה זמן עשית?'],
      ['strengthPlayer.dataEntry.title.reps', 'כמה חזרות עשית?'],
      ['strengthPlayer.dataEntry.subtitle.time', 'הכניסו כאן או שעברו לסטופר ונספור עבורכם!'],
      ['strengthPlayer.dataEntry.subtitle.reps', 'הכניסו כאן את כמות החזרות שביצעת'],
      ['strengthPlayer.dataEntry.seconds', "שנ'"],
      ['strengthPlayer.dataEntry.left', 'שמאל'],
      ['strengthPlayer.dataEntry.right', 'ימין'],
      ['strengthPlayer.dataEntry.save', 'שמירה'],
      ['strengthPlayer.logDrawer.prompt.timeSide', 'כמה שניות לכל צד?'],
      ['strengthPlayer.logDrawer.prompt.time', 'כמה שניות החזקת?'],
      ['strengthPlayer.logDrawer.prompt.repsSide', 'כמה חזרות לכל צד?'],
      ['strengthPlayer.logDrawer.prompt.reps', 'כמה חזרות הצלחת מהתרגיל הקודם?'],
      ['strengthPlayer.logDrawer.save', 'שמירה ומעבר למנוחה'],
      ['strengthPlayer.logDrawer.swap', 'החלפת תרגיל'],
      ['strengthPlayer.inputState.prompt.reps', 'כמה חזרות הצלחת?'],
      ['strengthPlayer.inputState.save', 'שמירה'],
      ['strengthPlayer.exit.title', 'בטוחים שאתם רוצים לסיים את האימון?'],
      ['strengthPlayer.exit.text', 'כבר עוצרים? השרירים רק התחילו להתחמם!'],
      ['strengthPlayer.exit.continue', 'יאללה להמשיך'],
      ['strengthPlayer.exit.end', 'אני רוצה לסיים את האימון באמצע'],
      ['strengthPlayer.resume.title', 'להמשיך מאיפה שעצרת?'],
      ['strengthPlayer.resume.startOver', 'להתחיל מחדש'],
      ['strengthPlayer.pause.title', 'הפסקה'],
      ['strengthPlayer.pause.end', 'סיום אימון'],
      ['strengthPlayer.filling.done', 'סיימתי'],
      ['strengthPlayer.preparing.label', 'מתכוננים...'],
      ['strengthPlayer.demoGate.eyebrow', 'ככה עושים את זה'],
      ['strengthPlayer.tutorial.close', 'סגור'],
      ['strengthPlayer.restBar.title', 'מנוחה'],
      ['strengthPlayer.restBar.skip', 'דלג'],
      ['strengthPlayer.sessionList.title', 'מהלך האימון'],
      ['strengthPlayer.sessionList.back', 'חזרה לנגן'],
      ['strengthPlayer.sessionList.totals', 'עד עכשיו'],
      ['strengthPlayer.controls.stopAria', 'סיום אימון · לחיצה ארוכה'],
      ['strengthPlayer.controls.lapAria', 'הקפה'],
      ['strengthPlayer.controls.stopHint', 'לחיצה ארוכה על הריבוע מסיימת'],
      ['strengthPlayer.header.paused', 'הפסקה'],
      ['strengthPlayer.header.logTitle', 'התרגיל שביצעת'],
      ['strengthPlayer.header.rest', 'מנוחה'],
      ['strengthPlayer.header.resume', 'המשך'],
      ['strengthPlayer.header.pause', 'השהייה'],
    ]);
  });

  it('values and branches', () => {
    // RestScreen: `<bdi>+{REST_EXTEND_SECONDS}</bdi> שנ׳` — the rich message keeps the tag text and the unit
    expect(t.rich('strengthPlayer.rest.extend', { seconds: String(15), bdi: (c: string[]) => `[${c.join('')}]` })).toEqual(['[+15] שנ׳']);
    // ResumeWorkoutDialog: `כ-{minutes} דקות.` with minutes through withUnit('minutes')
    for (const minutes of [1, 25, 1234]) {
      expect(t('strengthPlayer.resume.text', { duration: withUnit('minutes', minutes, tc) })).toBe(`מצאנו אימון פעיל שלא הסתיים — עצרת אחרי כ-${minutes} דקות. אפשר להמשיך בדיוק מאותה נקודה.`);
    }
    // FindEquipmentOverlay: old g(gender, male, female) — null / undefined / 'other' were the male form
    const g = (gender: string | null | undefined, m: string, f: string) => (gender === 'female' ? f : m);
    for (const gender of ['male', 'female', 'other', null, undefined] as const) {
      const gv = gender ?? 'male';
      expect(t('strengthPlayer.findEquipment.title.single', { gender: gv })).toBe(g(gender, 'מצא את המתקן', 'מצאי את המתקן'));
      expect(t('strengthPlayer.findEquipment.title.tabata', { gender: gv })).toBe(g(gender, 'מצא את המתקנים', 'מצאי את המתקנים'));
      expect(t('strengthPlayer.findEquipment.swap', { gender: gv })).toBe(g(gender, 'החלף', 'החליפי'));
      expect(t('strengthPlayer.findEquipment.cantFind', { gender: gv })).toBe(g(gender, 'לא מוצא, החלף תרגיל', 'לא מוצאת, החליפי תרגיל'));
      expect(t('strengthPlayer.demoGate.cta', { gender: gv })).toBe(g(gender, 'צפיתי, התחל', 'צפיתי, התחילי'));
      expect(t('strengthPlayer.pause.endStation', { gender: gv })).toBe(g(gender, 'סיים את התחנה', 'סיימי את התחנה'));
    }
    expect(t('strengthPlayer.findEquipment.beforeBlock')).toBe('לפני שמתחילים את הבלוק');
    expect(t('strengthPlayer.findEquipment.found')).toBe('מצאתי');
    expect(t('strengthPlayer.findEquipment.forExercise', { name: 'מתח' })).toBe('לתרגיל: מתח');
    // SetPillsGrid
    for (const n of [1, 2, 10]) expect(t('strengthPlayer.pills.reps', { n })).toBe(n === 1 ? 'חזרה אחת' : `${n} חזרות`);
    for (const n of [1, 2, 45, 1200]) expect(t('strengthPlayer.pills.seconds', { isOne: n === 1 ? 'yes' : 'no', n: String(n) })).toBe(n === 1 ? 'שנייה אחת' : `${n} שניות`);
    expect(t('strengthPlayer.pills.sideTime', { right: '20', left: '18' })).toBe(`${20}"י׳ | ${18}"ש׳`);
    expect(t('strengthPlayer.pills.sideReps', { right: '6', left: '7' })).toBe(`${6}י׳ | ${7}ש׳`);
    expect(t('strengthPlayer.pills.set', { n: '3' })).toBe(`סט ${2 + 1}`);
    // RunnerHeader
    expect(t('strengthPlayer.header.interval', { current: '3', total: '8' })).toBe('אינטרוול 3/8');
    expect(t('strengthPlayer.header.partner', { name: 'מקבילים' })).toBe('מעבר לבן זוג הסופרסט: מקבילים');
  });
});

describe('strengthPlayer: block cards, playlist, active view, timer card, detail, video', () => {
  it('plain strings', () => {
    cases([
      ['strengthPlayer.blockCard.warmup', 'חימום'],
      ['strengthPlayer.blockCard.cooldown', 'שחרור'],
      ['strengthPlayer.blockCard.single', 'תרגיל בודד'],
      ['strengthPlayer.blockCard.oneRound', 'סבב 1'],
      ['strengthPlayer.blockCard.done', 'בוצע'],
      ['strengthPlayer.blockCard.markDone', 'סמן כבוצע'],
      ['strengthPlayer.blockCard.rest', 'מנוחה'],
      ['strengthPlayer.blockCard.skip', 'דלג'],
      ['strengthPlayer.playlist.title', 'רשימת התרגילים'],
      ['strengthPlayer.playlist.tabata', 'טבטה'],
      ['strengthPlayer.active.perSide', ' (לכל צד)'],
      ['strengthPlayer.active.targetUnit', 'יעד'],
      ['strengthPlayer.active.superset', 'סופרסט'],
      ['strengthPlayer.active.swap', 'החלפת תרגיל'],
      ['strengthPlayer.isometric.sideRight', 'צד ימין'],
      ['strengthPlayer.isometric.sideLeft', 'צד שמאל'],
      ['strengthPlayer.isometric.tabata', 'טבטה'],
      ['strengthPlayer.isometric.hold', 'זמן החזקה'],
      ['strengthPlayer.isometric.start', 'התחלה'],
      ['strengthPlayer.isometric.done', 'סיימתי'],
      ['strengthPlayer.isometric.paused', 'מושהה'],
      ['strengthPlayer.isometric.reset', 'איפוס'],
      ['strengthPlayer.isometric.resume', 'המשך'],
      ['strengthPlayer.isometric.pause', 'השהייה'],
      ['strengthPlayer.detail.technique', 'סרטון טכניקה מפורט'],
      ['strengthPlayer.detail.programs', 'תוכניות'],
      ['strengthPlayer.detail.program', 'תוכנית'],
      ['strengthPlayer.detail.equipment', 'ציוד'],
      ['strengthPlayer.detail.primaryMuscle', 'שריר ראשי'],
      ['strengthPlayer.detail.secondaryMuscles', 'שרירים משניים'],
      ['strengthPlayer.detail.description', 'תיאור'],
      ['strengthPlayer.detail.goal', 'מטרות'],
      ['strengthPlayer.detail.instructions', 'הוראות ביצוע'],
      ['strengthPlayer.detail.cues', 'דגשים'],
      ['strengthPlayer.detail.notes', 'טיפים'],
      ['strengthPlayer.video.refresh', 'רענן סרטון'],
      ['strengthPlayer.video.errorLoad', 'הסרטון לא נטען'],
      ['strengthPlayer.video.errorDetect', 'לא הצלחנו לזהות את הסרטון'],
      ['strengthPlayer.video.unknownId', 'לא ידוע'],
      ['strengthPlayer.video.watchYoutube', 'צפה ב-YouTube'],
      ['strengthPlayer.video.retry', 'נסה שוב'],
      ['strengthPlayer.video.fullTutorial', 'צפה בהסבר המלא'],
      ['strengthPlayer.video.fullscreen', 'מסך מלא'],
      ['strengthPlayer.video.rotateHint', 'סובב לצפייה מלאה'],
      ['strengthPlayer.derived.loading', 'טוען...'],
      ['strengthPlayer.derived.workoutEnd', 'סיום האימון'],
    ]);
  });

  it('values and branches', () => {
    const n = 3;
    expect(t('strengthPlayer.blockCard.superset', { n: String(n) })).toBe(`סופר סט (${n} תרגילים)`);
    expect(t('strengthPlayer.blockCard.exercises', { n: String(n) })).toBe(`${n} תרגילים`);
    expect(t('strengthPlayer.blockCard.pyramid', { label: 'סט שיא', n: '4' })).toBe(`${'סט שיא'} (${4} שלבים)`);
    expect(t('strengthPlayer.blockCard.rounds', { n: '3' })).toBe(`${3}x סבבים`);
    expect(t('strengthPlayer.groups.superset', { n: '2' })).toBe(`סופר סט (${2} תרגילים)`);
    expect(t('strengthPlayer.groups.count', { n: '2' })).toBe(`${2} תרגילים`);
    expect(t('strengthPlayer.playlist.subtitle', { count: '5', name: 'אימון כוח' })).toBe(`${5} תרגילים · ${'אימון כוח'}`);
    for (const count of [1, 2, 7]) expect(t('strengthPlayer.playlist.segmentCount', { n: count })).toBe(`· ${count} ${count === 1 ? 'תרגיל' : 'תרגילים'}`);
    for (const [unit, word] of [['seconds', 'שניות'], ['reps', 'חזרות']] as const) {
      expect(t('strengthPlayer.card.stepTarget', { n: '12', unit })).toBe(`${12} ${word}`);
      expect(t('strengthPlayer.derived.stepTarget', { value: '1200', unit })).toBe(`${1200} ${word}`);
    }
    expect(t('strengthPlayer.active.captionRound', { current: '2', total: '3' })).toBe(`סבב ${2} מתוך ${3}`);
    expect(t('strengthPlayer.active.round', { current: '2', total: '3' })).toBe(`סבב ${2} מתוך ${3}`);
    expect(t('strengthPlayer.active.step', { current: '2', total: '3' })).toBe(`שלב ${2} מתוך ${3}`);
    expect(t('strengthPlayer.active.target', { target: '10' })).toBe(`(יעד: ${10})`);
    expect(t('strengthPlayer.active.stepUnit', { unit: 'seconds' })).toBe('שנ׳');
    expect(t('strengthPlayer.active.stepUnit', { unit: 'reps' })).toBe('חז׳');
    expect(t('strengthPlayer.isometric.startSide', { side: 'צד ימין' })).toBe(`התחל ${'צד ימין'}`);
    expect(t('strengthPlayer.isometric.machine', { machine: '1', count: '2', round: '1', rounds: '2' })).toBe(`מתקן ${1}/${2} · סבב ${1}/${2}`);
    expect(t('strengthPlayer.detail.programLevel', { name: 'כוח', level: '3' })).toBe(`${'כוח'} · רמה ${3}`);
    expect(t('strengthPlayer.video.idLine', { id: 'abc' })).toBe(`סרטון YouTube עם ID: ${'abc'}`);
    expect(t('strengthPlayer.video.linkLine', { url: 'https://y' })).toBe(`קישור YouTube: ${'https://y'}...`);
    expect(t('strengthPlayer.mediaSession.rest', { name: 'מתח' })).toBe(`מנוחה: ${'מתח'}`);
  });
});

describe('strengthPlayer: timed cards', () => {
  it('plain strings and values', () => {
    cases([
      ['strengthPlayer.timed.clock.rest', 'מנוחה'],
      ['strengthPlayer.timed.clock.work', 'עבודה'],
      ['strengthPlayer.timed.info.gotIt', 'הבנתי'],
      ['strengthPlayer.timed.header.formatAria', 'מה זה הפורמט'],
      ['strengthPlayer.timed.header.resume', 'המשך'],
      ['strengthPlayer.timed.header.pause', 'השהייה'],
      ['strengthPlayer.timed.ready.formatAria', 'מה זה הפורמט'],
      ['strengthPlayer.timed.ready.start', 'התחלה'],
      ['strengthPlayer.timed.reps.promptTime', 'כמה שניות הספקת?'],
      ['strengthPlayer.timed.reps.promptReps', 'כמה חזרות הספקת?'],
      ['strengthPlayer.timed.reps.save', 'שמירה'],
      ['strengthPlayer.timed.reps.skipPartial', 'לא הספקתי חזרות'],
      ['strengthPlayer.timed.reps.skip', 'דלג'],
      ['strengthPlayer.timed.list.part', 'חלק'],
      ['strengthPlayer.timed.list.back', 'חזרה לנגן'],
      ['strengthPlayer.timed.list.basket', 'בסל'],
      ['strengthPlayer.timed.list.queue', 'הבא בתור'],
      ['strengthPlayer.timed.work.minuteLeft', 'נותרו בדקה'],
      ['strengthPlayer.timed.work.done', 'סיימתי'],
    ]);
    expect(t('strengthPlayer.timed.done.completed', { title: 'AMRAP' })).toBe(`${'AMRAP'} הושלם`);
    expect(t('strengthPlayer.timed.roundToast.done', { n: '2' })).toBe(`סבב ${1 + 1} הושלם`);
    expect(t('strengthPlayer.timed.roundToast.next', { n: '3' })).toBe(`מתחילים סבב ${1 + 2}`);
    for (const count of [1, 3]) expect(t('strengthPlayer.timed.list.segmentLine', { title: 'חימום', n: count })).toBe(`${'חימום'} · ${count} ${count === 1 ? 'תרגיל' : 'תרגילים'}`);
    expect(t('strengthPlayer.timed.list.remaining', { summary: '1 סבב מלא', remaining: '3:20' })).toBe(`${'1 סבב מלא'} · ${'3:20'} נותרו`);
    expect(t('strengthPlayer.timed.list.queueSuffix', { title: 'סבב 2' })).toBe(` · ${'סבב 2'}`);
    expect(t('strengthPlayer.timed.list.after', { list: ['א', 'ב'].join(' · ') })).toBe(`אחר כך: ${['א', 'ב'].join(' · ')}`);
    expect(t('strengthPlayer.timed.work.metersLeft', { unit: unitLabel('m', tc) })).toBe('מ׳ נותרו');
    expect(t('strengthPlayer.timed.work.gps', { distance: withUnit('m', 400, tc) })).toBe(`ב-${400} מ׳ ה-GPS מעביר אוטומטית לבא`);
  });
});

describe('player: share bar, survey, xp row', () => {
  it('share texts and labels', () => {
    const shareUrl = 'https://out/x';
    expect(t('runShare.nowWalk', { url: shareUrl })).toBe(`בואו ללכת איתי עכשיו 🚶 ${shareUrl}`);
    expect(t('runShare.nowRun', { url: shareUrl })).toBe(`בואו לרוץ איתי עכשיו 🏃 ${shareUrl}`);
    const args = { date: '03/11', time: '18:30', url: shareUrl };
    expect(t('runShare.laterWalk', args)).toBe(`קבעתי הליכה ב-${args.date} בשעה ${args.time} 🚶 בואו להצטרף! ${shareUrl}`);
    expect(t('runShare.laterRun', args)).toBe(`קבעתי ריצה ב-${args.date} בשעה ${args.time} 🏃 בואו להצטרף! ${shareUrl}`);
    cases([
      ['runShare.when', 'מתי'],
      ['runShare.now', 'עכשיו'],
      ['runShare.later', 'אחר כך'],
      ['runShare.date', 'תאריך'],
      ['runShare.time', 'שעה'],
      ['runShare.btn.busy', 'שותף...'],
      ['runShare.btn.pending', 'הקישור יישלח כשתתחיל'],
      ['runShare.btn.scheduled', 'שתף אימון מתוזמן'],
      ['runShare.btn.invite', 'הזמן חבר לאימון'],
      ['survey.easy', 'קל מדי'],
      ['survey.right', 'בדיוק'],
      ['survey.hard', 'קשה מדי'],
      ['survey.thanksEasy', 'תודה! נשתמש בזה כדי להתאים את האימונים הבאים.'],
      ['survey.thanksHard', 'תודה על הכנות! נשתמש בזה כדי להתאים את האימונים הבאים.'],
      ['survey.thanksRight', 'מעולה, תודה!'],
      ['survey.title', 'איך היה האימון? 🎯'],
      ['survey.subtitle', 'לא חובה — זה עוזר לנו להתאים את האימונים'],
      ['survey.close', 'סגור'],
      ['survey.submit', 'שלח משוב'],
      ['survey.skipOnce', 'דלג הפעם'],
      ['survey.skipAlways', 'תמיד דלג'],
      ['survey.compactTitle', 'איך היה?'],
      ['xpStatus.awarded', 'XP הושלם'],
      ['xpStatus.failed', 'שמירת XP נכשלה'],
      ['xpStatus.pending', 'מחשב XP...'],
    ]);
  });
});

type SKey = Parameters<typeof ts>[0];
const scases = (rows: Array<[SKey, string, Record<string, unknown>?]>) => {
  for (const [key, old, values] of rows) expect(ts(key, values), key).toBe(old);
};

describe('summary: aerobic view', () => {
  it('plain strings', () => {
    scases([
      ['aerobic.tab.overview', 'סקירה'],
      ['aerobic.tab.stats', 'סטטיסטיקה'],
      ['aerobic.tab.segments', 'מקטעים'],
      ['aerobic.tab.map', 'מפה'],
      ['aerobic.expandMap', 'הגדל מפה'],
      ['aerobic.closeMap', 'סגור מפה'],
      ['aerobic.repPace.title', 'קצב בכל חזרה'],
      ['aerobic.lapPace.title', 'קצב בכל הקפה'],
      ['aerobic.lapSpeed.title', 'מהירות בכל הקפה'],
      ['aerobic.openSegments', 'לפירוט בלשונית מקטעים'],
      ['aerobic.participants', 'משתתפים'],
      ['aerobic.rating.thanks', 'תודה על הדירוג!'],
      ['aerobic.rating.title', 'דרגו את המסלול'],
      ['aerobic.rating.submit', 'שלח דירוג'],
      ['aerobic.delete.link', 'בטל / מחק אימון'],
      ['aerobic.delete.title', 'למחוק את האימון?'],
      ['aerobic.delete.text', 'האימון יימחק, ה-XP והרצף יוחזרו לאחור.'],
      ['aerobic.delete.cancel', 'בטל'],
      ['aerobic.delete.deleting', 'מוחק...'],
      ['aerobic.delete.confirm', 'מחק אימון'],
      ['aerobic.delete.aria', 'מחק אימון'],
      ['aerobic.noLaps', 'אין הקפות מוגדרות לאימון זה'],
      ['aerobic.allParticipants', 'כל המשתתפים'],
      ['aerobic.stat.distance', 'מרחק'],
      ['aerobic.stat.time', 'זמן'],
      ['aerobic.stat.speed', 'מהירות ממוצעת'],
      ['aerobic.stat.pace', 'קצב ממוצע'],
      ['aerobic.stat.calories', 'קלוריות'],
      ['aerobic.stat.climb', 'עלייה מצטברת'],
      ['aerobic.topBar.title', 'סיכום אימון'],
      ['aerobic.footer.close', 'סגור'],
      ['aerobic.footer.finishSaved', 'סיום ושמור'],
      ['aerobic.footer.finish', 'סיום'],
    ]);
  });
  it('values', () => {
    expect(ts('aerobic.pairTogether', { distance: withUnit('km', (12.34).toFixed(1), tc) })).toBe(`רצתם ${(12.34).toFixed(1)} ק״מ יחד`);
    expect(ts('aerobic.repsChip', { reps: String(6) })).toBe(`${6} חזרות`);
    expect(ts('aerobic.lapsChip', { count: String(2) })).toBe(`${2} הקפות`);
    expect(ts('aerobic.rating.thanksXp', { xp: String(5) })).toBe(`תודה על הדירוג! +${5} XP`);
    expect(ts('aerobic.rating.star', { star: '3' })).toBe(`${3} כוכבים`);
    expect(ts('aerobic.kcal', { n: String(312) })).toBe(`${312} קק״ל`);
    expect(ts('aerobic.kcal', { n: String(1234) })).toBe(`${1234} קק״ל`);
    expect(ts('aerobic.paceValue', { value: '5:27' })).toBe('5:27 ד׳/ק״מ');
    expect(withUnit('km', (5.234).toFixed(2), tc)).toBe(`${(5.234).toFixed(2)} ק״מ`);
    expect(`${'12.3'} ${unitLabel('kmh', tc)}`).toBe('12.3 קמ״ש');
    expect(withUnit('m', 1234, tc)).toBe(`${1234} מ׳`);
  });
});

describe('summary: hybrid view, drawer, shell, page', () => {
  it('plain strings', () => {
    scases([
      ['hybrid.tab.overview', 'סקירה'],
      ['hybrid.tab.aerobic', 'אירובי'],
      ['hybrid.tab.strength', 'כוח'],
      ['hybrid.tab.stats', 'סטטיסטיקה'],
      ['hybrid.title', 'אימון משולב'],
      ['hybrid.totalTime', 'זמן כולל'],
      ['hybrid.banner', 'אימון משולב מלא — גם ריצה וגם כוח!'],
      ['hybrid.activeMinutes', 'דקות פעילות'],
      ['hybrid.course', 'מהלך האימון'],
      ['hybrid.tile.distance', 'מרחק'],
      ['hybrid.tile.sets', 'סטים'],
      ['hybrid.tile.segments', 'מקטעים'],
      ['hybrid.tile.calories', 'קלוריות'],
      ['hybrid.kcal', 'קק״ל'],
      ['hybrid.aerobic.distance', 'מרחק ריצה'],
      ['hybrid.aerobic.time', 'זמן ריצה'],
      ['hybrid.aerobic.segments', 'מקטעי ריצה'],
      ['hybrid.strength.setsDone', 'סטים שהושלמו'],
      ['hybrid.strength.stations', 'תחנות כוח'],
      ['hybrid.stats.time', 'זמן'],
      ['hybrid.stats.kcal', 'קק״ל'],
      ['hybrid.stats.segments', 'מקטעים'],
      ['hybrid.stats.aerobicSegments', 'מקטעי ריצה'],
      ['hybrid.stats.strengthStations', 'תחנות כוח'],
      ['hybrid.share', 'שתפו'],
      ['hybrid.deleteAria', 'מחק אימון'],
      ['hybrid.finish', 'סיום'],
      ['hybrid.topBar.title', 'סיכום אימון'],
      ['drawer.close', 'סגירה'],
      ['drawer.aria', 'סיכום אימון'],
      ['shell.weeklyAerobic', 'אימוני אירובי השבוע'],
      ['shell.activeMinutes', 'דקות פעילות'],
      ['page.loading', 'טוען...'],
      ['page.title', 'האימון הושלם!'],
      ['page.notNow', 'לא עכשיו'],
      ['page.finish', 'סיום וחזרה לבית'],
    ]);
  });
  it('values and the share text', () => {
    const sets = 4;
    expect(ts('hybrid.sets', { n: String(sets) })).toBe(`${sets} סטים`);
    const km = (1.5).toFixed(2);
    const text = ts('hybrid.shareText', { distance: withUnit('km', km, tc), sets: ts('hybrid.sets', { n: String(sets) }) });
    expect(text).toBe(`סיימתי אימון משולב — ${km} ק״מ · ${sets} סטים 🏃💪`);
  });
  it('gendered page copy (moved from SUMMARY_COPY; unknown = neutral)', () => {
    const t3 = (key: 'page.keepGoing' | 'page.claimBonus') => (['male', 'female', 'other'] as const).map((gender) => ts(key, { gender }));
    expect(t3('page.keepGoing')).toEqual(['כל הכבוד! המשך כך!', 'כל הכבוד! המשיכי כך!', 'כל הכבוד! ככה ממשיכים!']);
    expect(t3('page.claimBonus')).toEqual(['השלם פרופיל וקבל בונוס', 'השלימי פרופיל וקבלי בונוס', 'משלימים פרופיל ומקבלים בונוס']);
  });
});
