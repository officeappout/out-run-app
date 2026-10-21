/**
 * Namespace `player`, running players (`run.*`, i18n wave 2): every Hebrew key
 * returns exactly what the code rendered before the extraction. The `old`
 * side of each case is the original literal / template expression, copied
 * verbatim from the component (origin/main @ fea3d25b).
 *
 * The static-markup parity snapshots (components/__tests__/run-player-i18n,
 * overview-v2/__tests__/run-overview-i18n) cover most keys in context; this
 * test also pins the ones a static render can't reach: the containers that
 * need the real engines (FreeRunActive / FreeRunOverlay[V2], PlannedRunActive,
 * the *LiveV2 players), the portalled sheets and drawers (settings, התאם קצב,
 * החלף מקטע, the home sheet), toasts, the jump confirm and the share text.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/player.json';
import { player } from '@/messages/ns/player';
import { makeT } from '../t';

const t = makeT('he', player);

describe('player (he) — byte-identical to the pre-extraction literals', () => {
  it('plain strings (ICU leaves quotes, geresh and gershayim alone)', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['run.planned.lapLogged', "הקפה נרשמה"],
      ['run.planned.effort', "מאמץ"],
      ['run.planned.paceNowUnit', "קצב עכשיו · דק׳ לק״מ"],
      ['run.planned.totalKm', "ק״מ סה״כ"],
      ['run.planned.untilEnd', "עד סוף האימון"],
      ['run.planned.skip', "דלג"],
      ['run.planned.paceNow', "קצב עכשיו"],
      ['run.planned.recoveryTime', "זמן"],
      ['run.planned.general.title', "נתונים כלליים"],
      ['run.planned.general.km', "קילומטר"],
      ['run.planned.general.avgPace', "קצב ממוצע"],
      ['run.planned.general.time', "זמן"],
      ['run.planned.general.kcal', "קק״ל"],
      ['run.planned.tab.block', "הבלוק הנוכחי"],
      ['run.planned.tab.general', "נתונים כלליים"],
      ['run.planned.control.finishBlock', "סיום הבלוק · מעבר לבא"],
      ['run.planned.control.lap', "הקפה"],
      ['run.session.title', "מהלך האימון"],
      ['run.session.backToPlayer', "חזרה לנגן"],
      ['run.session.status.now', "עכשיו"],
      ['run.session.status.upNext', "בעוד"],
      ['run.session.section.warmup', "חימום"],
      ['run.session.section.main', "העיקר"],
      ['run.session.section.workout', "האימון"],
      ['run.session.section.cooldown', "שחרור"],
      ['run.session.soFar', "עד עכשיו"],
      ['run.session.jump.body', "הבלוקים שביניהם ידולגו"],
      ['run.session.jump.cancel', "ביטול"],
      ['run.session.jump.confirm', "דלגו"],
      ['run.paceScale.slow', "איטי"],
      ['run.paceScale.fast', "מהיר"],
      ['run.planned.control.pauseHoldToEnd', "השהה · לחיצה ארוכה מסיימת"],
      ['run.planned.mini.fallbackTitle', "אימון מתוכנן"],
      ['run.planned.recenter', "מרכז את המפה"],
      ['run.continuous.main.heroTime', "זמן"],
      ['run.continuous.main.heroKm', "ק״מ"],
      ['run.continuous.main.km', "ק״מ"],
      ['run.continuous.main.time', "זמן"],
      ['run.continuous.main.blockRemaining', "נותרו בבלוק"],
      ['run.continuous.pace.timeInZone', "זמן בטווח"],
      ['run.continuous.pace.time', "זמן"],
      ['run.continuous.distance.title', "מרחק כולל"],
      ['run.continuous.distance.unit', "ק״מ"],
      ['run.continuous.distance.totalTime', "זמן כולל"],
      ['run.continuous.distance.kcal', "קק״ל"],
      ['run.continuous.page.main', "ראשי"],
      ['run.continuous.page.pace', "קצב"],
      ['run.continuous.page.distance', "מרחק"],
      ['run.continuous.lapLogged', "הקפה נרשמה"],
      ['run.continuous.pagesAria', "עמודי הנגן · החליקו לצד"],
      ['run.continuous.next', "הבא"],
      ['run.continuous.skipToNext', "דלג לבא"],
      ['run.continuous.recenter', "מרכז את המפה"],
      ['run.free.title.run', "ריצה חופשית"],
      ['run.free.laps.empty.title', "אין הקפות עדיין"],
      ['run.free.laps.empty.bodyRun', "כל הקפה תופיע כאן עם הזמן והקצב שלה"],
      ['run.free.laps.empty.bodyRide', "כל הקפה תופיע כאן עם הזמן והמהירות שלה"],
      ['run.free.laps.col.lap', "הקפה"],
      ['run.free.laps.col.km', "ק״מ"],
      ['run.free.laps.col.time', "זמן"],
      ['run.free.laps.col.pace', "קצב"],
      ['run.free.laps.col.speed', "קמ״ש"],
      ['run.free.v2.gps.searching', "מחפש GPS…"],
      ['run.free.v2.gps.poor', "GPS חלש · ממשיך לחפש"],
      ['run.free.v2.gps.good', "GPS תקין"],
      ['run.free.v2.settings', "הגדרות אימון"],
      ['run.free.v2.goalReached', "הגעת ליעד"],
      ['run.lapsList.empty.title', "אין הקפות עדיין"],
      ['run.lapsList.empty.body', "ההקפות יופיעו כאן לאחר התחלת האימון"],
      ['run.lapsList.col.lap', "הקפה"],
      ['run.lapsList.col.distance', "מרחק ק\"מ"],
      ['run.lapsList.col.pace', "קצב דק' / ק\"מ"],
      ['run.lapsList.col.time', "זמן דק'"],
      ['run.stats.lap.km', "קילומטר"],
      ['run.stats.lap.pace', "קצב"],
      ['run.stats.lap.time', "זמן"],
      ['run.stats.lap.number', "הקפה"],
      ['run.stats.main.header', "נתונים כלליים"],
      ['run.stats.main.heroTime', "זמן"],
      ['run.stats.main.heroKm', "קילומטר"],
      ['run.stats.main.avgPace', "קצב ממוצע"],
      ['run.stats.main.km', "ק״מ"],
      ['run.stats.main.time', "זמן"],
      ['run.stats.main.kcal', "קק״ל"],
      ['run.vs.pickRival', "בחר רץ במפה להשוואה"],
      ['run.vs.meInitials', "אני"],
      ['run.vs.me', "אני"],
      ['run.vs.km', "ק\"מ"],
      ['run.vs.pace', "קצב"],
      ['run.vs.tied', "שווה בדיוק"],
      ['run.controls.resume', "המשך אימון"],
      ['run.controls.finish', "סיים אימון"],
      ['run.controls.pause', "השהה אימון"],
      ['run.controls.newLap', "הקפה חדשה"],
      ['run.invite.selfName', "אני"],
      ['run.invite.aria', "הזמן חבר לאימון"],
      ['run.lapSnapshot.time', "זמן"],
      ['run.lapSnapshot.pace', "קצב"],
      ['run.lapSnapshot.km', "ק\"מ"],
      ['run.gpsDebug.save', "⬆ שמור GPS trace"],
      ['run.gpsDebug.saving', "שומר…"],
      ['run.gpsDebug.saved', "✓ נשמר"],
      ['run.gpsDebug.error', "✗ שגיאה"],
      ['run.settings.title', "הגדרות אימון"],
      ['run.settings.autoLap.title', "הקפה אוטומטית"],
      ['run.settings.autoLap.off', "כבוי"],
      ['run.settings.autoLap.distance', "מרחק"],
      ['run.settings.autoLap.time', "זמן"],
      ['run.settings.autoLap.distanceLabel', "מרחק הקפה"],
      ['run.settings.autoLap.timeLabel', "זמן הקפה"],
      ['run.settings.more.title', "הגדרות נוספות"],
      ['run.settings.audio.title', "הכרזות קוליות"],
      ['run.settings.audio.body', "הכרזה על סטטיסטיקות הקפות"],
      ['run.settings.autoPause.title', "השהיה אוטומטית"],
      ['run.settings.autoPause.body', "עצירת טיימר כאשר התנועה נעצרת"],
      ['run.settings.countdown.title', "ספירה לאחור"],
      ['run.settings.countdown.body', "עיכוב של 5 שניות לפני התחלת האימון"],
      ['run.settings.save', "שמור"],
      ['run.free.classic.goal.distance', "מרחק"],
      ['run.free.classic.goal.time', "זמן"],
      ['run.free.classic.goal.calories', "קלוריות"],
      ['run.free.classic.goal.beyond', "מעבר ליעד"],
      ['run.free.classic.finish', "סיים אימון"],
      ['run.free.classic.gps.searching', "מחפש GPS…"],
      ['run.free.classic.gps.poor', "GPS חלש — ממשיך לחפש"],
      ['run.free.classic.gps.good', "GPS תקין ✓"],
      ['run.free.classic.aria.guided', "מסלול מודרך"],
      ['run.free.classic.aria.free', "אימון חופשי"],
      ['run.free.classic.goalReached', "🎯 הגעת ליעד!"],
      ['run.free.dock.resume', "המשך אימון"],
      ['run.free.dock.finish', "סיים אימון"],
      ['run.free.dock.lap', "הקפה"],
      ['run.free.dock.pause', "השהה אימון"],
      ['run.commute.unit.min', "מ׳"],
      ['run.commute.unit.sec', "שנ׳"],
      ['run.commute.unit.minutes', "דק׳"],
      ['run.commute.unit.hours', "שעות"],
      ['run.commute.destinationFallback', "יעד"],
      ['run.commute.arrived', "הגעת ליעד"],
      ['run.commute.etaLabel', "זמן משוער עד ליעד"],
      ['run.commute.remaining', "נותר"],
      ['run.commute.arrival', "הגעה משוערת"],
      ['run.commute.waitingGps', "ממתין לאיתור GPS…"],
      ['run.story.track.title', "מובילות"],
      ['run.elevationAhead.aria', "פרופיל גובה לאורך המסלול"],
      ['run.briefing.ladder.title', "איפה הקצב הזה אצלך"],
      ['run.briefing.ladder.unit', "דק׳/ק״מ"],
      ['run.briefing.surfaces.title', "איפה כדאי לרוץ"],
      ['run.missed.body', "פספסת כמה אימונים? הכל בסדר. אימון האיכות שלך עדיין מחכה – רוצה לבצע אותו היום?"],
      ['run.missed.doIt', "בוא נעשה את זה"],
      ['run.missed.continue', "המשך כרגיל"],
      ['run.realign.title', "שמחים שחזרת!"],
      ['run.realign.body', "ראינו שלקחת הפסקה קצרה. איך היית רוצה להמשיך את התוכנית?"],
      ['run.realign.continue', "להמשיך כרגיל"],
      ['run.realign.backOneWeek', "לחזור שבוע אחורה"],
      ['run.realign.reset', "אפס תוכנית"],
      ['run.rebuild.title', "ברוכים השבים!"],
      ['run.rebuild.body', "עבר קצת זמן מאז האימון האחרון. כדי למנוע פציעות, כדאי להתאים את התוכנית מחדש לכושר הנוכחי שלך."],
      ['run.rebuild.rebuild', "בנה לי תוכנית מעודכנת"],
      ['run.rebuild.continue', "אני בסדר, פשוט תמשיך"],
      ['run.preview.difficulty.hard', "קשה"],
      ['run.preview.difficulty.medium', "בינוני"],
      ['run.preview.difficulty.easy', "קל"],
      ['run.preview.quality', "אימון איכות"],
      ['run.preview.start', "התחל אימון"],
      ['run.plannedActive.fallbackTitle', "אימון מתוכנן"],
      ['run.plannedActive.pause.title', "הפסקה"],
      ['run.plannedActive.pause.time', "זמן"],
      ['run.plannedActive.pause.km', "ק״מ"],
      ['run.plannedActive.pause.resume', "התחילו שוב"],
      ['run.plannedActive.pause.finish', "סיום אימון"],
      ['run.plannedActive.exit.title', "בטוחים שאתם רוצים לסיים?"],
      ['run.plannedActive.exit.body', "האימון יישמר עם הנתונים שנאספו עד כה"],
      ['run.plannedActive.exit.continue', "יאללה להמשיך"],
      ['run.plannedActive.exit.finish', "אני רוצה לסיים את האימון"],
      ['run.overview.fitFallback', "מתאים"],
      ['run.overview.drill.back', "חזרה"],
      ['run.overview.graphs.intensity', "עצימות"],
      ['run.overview.graphs.swipeHint', "החלק לגובה המסלול ›"],
      ['run.overview.graphs.elevation', "גובה לאורך האימון"],
      ['run.overview.map.eyebrow', "מבט על אימון"],
      ['run.overview.map.routeFallback', "המסלול"],
      ['run.overview.chosen.title', "המסלול שבחרת"],
      ['run.overview.chosen.showOnMap', "הצג במפה"],
      ['run.overview.chosen.clear', "בלי מסלול"],
      ['run.overview.cta.startOnRoute', "התחל אימון במסלול"],
      ['run.overview.cta.start', "התחל אימון"],
      ['run.overview.cta.clearRoute', "בלי מסלול"],
      ['run.overview.cta.pickOnMap', "בחר במפה"],
      ['run.overview.cta.suggest', "הצע לי מסלול"],
      ['run.overview.cta.searching', "מחפש מסלולים מכאן…"],
      ['run.overview.cta.noneNear', "לא מצאנו מסלול מתאים קרוב — אפשר לרוץ מכאן"],
      ['run.overview.homeSheet.close', "סגירה"],
      ['run.overview.homeSheet.loading', "טוען אימון..."],
      ['run.overview.suggest.back', "חזרה"],
      ['run.overview.suggest.nameFallback', "לולאה"],
      ['run.overview.suggest.selected', "נבחר"],
      ['run.overview.suggest.selectedOfficial', "נבחר · מסלול רשמי"],
      ['run.overview.suggest.select', "בחר"],
      ['run.overview.level.lighter', "קליל"],
      ['run.overview.level.planned', "מאוזן"],
      ['run.overview.level.harder', "עוצמתי"],
      ['run.overview.level.aria', "בחירת עומס"],
      ['run.overview.level.manualNote', "העיקר הוחלף ידנית — בחירה ברמה תחזיר מבנה מהתוכנית"],
      ['run.overview.detail', "פירוט"],
      ['run.overview.axisTitle', "מהלך האימון"],
      ['run.overview.axis.fromHere', "יוצאים מכאן · ה-GPS מודד את הדרך"],
      ['run.overview.axis.routeStart', "תחילת המסלול"],
      ['run.overview.axis.routeStartHere', "תחילת המסלול · כאן"],
      ['run.overview.axis.workoutStart', "תחילת האימון"],
      ['run.overview.axis.workoutEnd', "סיום האימון"],
      ['run.overview.swap.level.lower', "קל יותר"],
      ['run.overview.swap.level.same', "דומה"],
      ['run.overview.swap.level.higher', "קשה יותר"],
      ['run.overview.swap.title', "החלף מקטע"],
      ['run.overview.swap.subtitle', "העיקר כולו — חזרות והתאוששות יחד · הקצב נשאר שלך"],
      ['run.overview.swap.confirm', "החלף"],
      ['run.overview.swap.current', "נוכחי"],
      ['run.overview.swap.empty', "אין חלופות לאימון הזה"],
      ['run.overview.pace.title', "התאם קצב"],
      ['run.overview.pace.save', "שמור לאימון הזה"],
      ['run.overview.pace.fasterAria', "מהר יותר ב-5 שניות"],
      ['run.overview.pace.slowerAria', "לאט יותר ב-5 שניות"],
      ['run.overview.pace.unit', "דק׳ לק״מ"],
      ['run.overview.pace.fromProfile', "מהפרופיל שלך"],
      ['run.overview.pace.barFast', "מהיר"],
      ['run.overview.pace.barSlow', "איטי"],
      ['run.overview.pace.warn.fast', "מהיר מדי לרמה שלך — עלול לפגוע בתוכנית. אפשר לשמור, אבל עדיף להישאר בטווח."],
      ['run.overview.pace.warn.slow', "איטי מהטווח שלך — האימון יהיה קל מהמתוכנן. אפשר לשמור, אבל עדיף להישאר בטווח."],
      ['run.overview.edit.editedTag', "מותאם"],
      ['run.overview.edit.swapAria', "החלף מקטע"],
      ['run.overview.edit.swap', "החלף"],
      ['run.overview.edit.undo', "בטל"],
      ['run.overview.fitCard.open', "לאימון הזה כאן"],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('planned card (v2)', () => {
    const rep = 3, total = 6, meta = '400 מ׳', value = '4:51', band = '4:30–4:45', zone = 'אינטרוול', name = 'חזרה 4';
    expect(t('run.planned.repOf', { rep: String(rep), total: String(total) })).toBe(`חזרה ${rep} מתוך ${total}`);
    expect(t('run.planned.repOfMeta', { rep: String(rep), total: String(total), meta })).toBe(`חזרה ${rep} מתוך ${total}${meta ? ` · ${meta}` : ''}`);
    expect(t('run.planned.repN', { rep: String(rep) })).toBe(`חזרה ${rep}`);
    expect(t('run.planned.afterRep', { rep: String(rep), value })).toBe(`אחרי חזרה ${rep} · ${value}`);
    expect(t('run.planned.target', { band })).toBe(`יעד ${band}`);
    expect(t('run.planned.targetZone', { zone })).toBe(`יעד · ${zone}`);
    for (const isRep of [true, false]) {
      const where = isRep ? 'בחזרה' : 'בבלוק';
      expect(t('run.planned.remaining', { where: isRep ? 'rep' : 'block' })).toBe(`נותרו ${where}`);
      expect(t('run.planned.elapsed', { where: isRep ? 'rep' : 'block' })).toBe(`זמן ${where}`);
    }
    for (const durationSeconds of [0, 90] as number[]) {
      const key = durationSeconds ? 'run.planned.untilNextAuto' : 'run.planned.untilNext';
      expect(t(key, { name })).toBe(`עד ${name}${durationSeconds ? ' · מתחילה לבד' : ''}`);
    }
    expect(t('run.planned.next', { name })).toBe(`הבא · ${name}`);
    expect(t('run.planned.atBand', { band })).toBe(`ב-${band}`);
    expect(t('run.planned.pagesAria', { page: String(1 + 1) })).toBe(`עמוד ${1 + 1} מתוך 2 · החליקו לצד`);
    expect(t('run.planned.mini.subtitle', { time: '20:34', km: '3.5' })).toBe(`${'20:34'} · ${'3.5'} ק״מ`);
  });

  it('planned session list (v2)', () => {
    for (const n of [1, 2, 12]) {
      expect(t('run.session.blocksMeta', { n })).toBe(`· ${n} ${n === 1 ? 'בלוק' : 'בלוקים'}`);
      const sameRest = 90;
      const noRest = 0 as number;
      expect(t('run.session.repsMeta', { n })).toBe(`· ${n} ${n === 1 ? 'חזרה' : 'חזרות'}${noRest ? ` · ${noRest} שנ׳ בין` : ''}`);
      expect(t('run.session.repsMetaRest', { n, rest: String(sameRest) })).toBe(`· ${n} ${n === 1 ? 'חזרה' : 'חזרות'}${sameRest ? ` · ${sameRest} שנ׳ בין` : ''}`);
    }
    expect(t('run.session.repN', { rep: '4' })).toBe(`חזרה ${4}`);
    expect(t('run.session.target', { band: '4:30–4:45' })).toBe(`יעד ${'4:30–4:45'}`);
    expect(t('run.session.inRange', { inRange: '3', scored: '5' })).toBe(`${3} מתוך ${5} בטווח`);
    const time = '20:34', km = '3.5', pace = '5:52';
    for (const avgPaceSec of [0, 352] as number[]) {
      const key = avgPaceSec > 0 ? 'run.session.totalsAvg' : 'run.session.totals';
      expect(t(key, { time, km, pace })).toBe(`${time} · ${km} ק״מ${avgPaceSec > 0 ? ` · ${pace} ממוצע` : ''}`);
    }
    expect(t('run.session.jump.title', { name: 'חזרה 5' })).toBe(`לדלג ל${'חזרה 5'}?`);
    expect(t('run.session.jump.title', { name: 'שחרור' })).toBe(`לדלג ל${'שחרור'}?`);
  });

  it('continuous (v2)', () => {
    const zone = 'ריצה קלה', band = '5:30–6:00';
    expect(t('run.continuous.zoneRange', { zone, band })).toBe(`טווח ${zone} ${band}`);
    expect(t('run.continuous.zoneName', { zone })).toBe(`טווח · ${zone}`);
    expect(t('run.continuous.distance.ofPlanned', { km: (5.2).toFixed(1) })).toBe(`מתוך ~${(5.2).toFixed(1)}`);
    expect(t('run.continuous.mini.subtitle', { time: '1:02:03', km: '12.4' })).toBe(`${'1:02:03'} · ${'12.4'} ק״מ`);
  });

  it('free run (v2 + classic)', () => {
    expect(t('run.free.title.ride', { activity: 'רכיבה' })).toBe(`${'רכיבה'} חופשית`);
    const title = 'ריצה חופשית', time = '20:34', km = '3.46', pace = '5:57', speed = '24.1';
    expect(t('run.free.laps.subtitle', { title })).toBe(`${title} · הקפות`);
    expect(t('run.free.laps.totals', { time, km })).toBe(`${time} · ${km} ק״מ${''}`);
    expect(t('run.free.laps.totalsAvgPace', { time, km, pace })).toBe(`${time} · ${km} ק״מ${` · ${pace} ממוצע`}`);
    expect(t('run.free.laps.totalsAvgSpeed', { time, km, speed })).toBe(`${time} · ${km} ק״מ${` · ${speed} קמ״ש ממוצע`}`);
    expect(t('run.free.laps.row', { n: '3' })).toBe(`הקפה ${3}`);
    expect(t('run.free.laps.rowActive', { n: '3' })).toBe(`הקפה ${3} · עכשיו`);
    expect(t('run.free.mini.speed', { speed })).toBe(`${speed} קמ״ש`);
    expect(t('run.free.mini.titleKm', { title, km })).toBe(`${title} · ${km} ק״מ`);
    expect(t('run.free.v2.lapsListAria', { done: '2' })).toBe(`רשימת ההקפות · ${2} הושלמו`);
    expect(t('run.free.v2.lapTitle', { n: '2', time })).toBe(`הקפה ${2} · ${time}`);
    expect(t('run.free.classic.goal.distanceValue', { current: (1.234).toFixed(2), target: (5).toFixed(1) }))
      .toBe(`${(1.234).toFixed(2)} / ${(5).toFixed(1)} ק״מ`);
    expect(t('run.free.classic.goal.caloriesValue', { current: String(Math.round(1234.4)), target: String(1500) }))
      .toBe(`${Math.round(1234.4)} / ${Math.round(1500)} קק״ל`);
  });

  it('stats, VS, story bar, side rail, invite', () => {
    expect(t('run.stats.lap.header', { n: '4' })).toBe(`הקפה ${4}`);
    expect(t('run.stats.slideAria', { n: String(0 + 1) })).toBe(`עבור לשקופית ${0 + 1}`);
    expect(t('run.vs.pacePerKm', { pace: '5:10' })).toBe(`${'5:10'} /ק"מ`);
    for (const gap of [5, 1250]) {
      expect(t('run.vs.leadBy', { gap: String(gap) })).toBe(`מוביל ב-${gap} מ'`);
      expect(t('run.vs.behindBy', { gap: String(gap) })).toBe(`מפגר ב-${gap} מ'`);
      expect(t('run.story.track.leadBy', { gap: String(gap) })).toBe(`מוביל ב-${Math.abs(gap)} מ'`);
      expect(t('run.story.track.behindBy', { gap: String(gap) })).toBe(`מפגר ב-${Math.abs(gap)} מ'`);
    }
    expect(t('run.story.dotAria', { label: 'מרחק' })).toBe(`עבור לסטורי ${'מרחק'}`);
    expect(t('run.sideRail.selectAria', { name: 'דנה' })).toBe(`בחר ${'דנה'}`);
    const shareUrl = 'https://appout.co.il/join/abc';
    expect(t('run.invite.shareWalk', { url: shareUrl })).toBe(`בוא/י ללכת איתי עכשיו 🚶 ${shareUrl}`);
    expect(t('run.invite.shareRun', { url: shareUrl })).toBe(`בוא/י לרוץ איתי עכשיו 🏃 ${shareUrl}`);
  });

  it('settings drawer (portalled — not in the snapshots)', () => {
    const tag = (c: unknown[]) => `[${c.join('')}]`;
    expect(t.rich('run.settings.autoLap.distanceValue', { value: (1).toFixed(1), unit: tag }).join('')).toBe(`${(1).toFixed(1)} [ק"מ]`);
    expect(t.rich('run.settings.autoLap.timeValue', { value: (5).toFixed(1), unit: tag }).join('')).toBe(`${(5).toFixed(1)} [דק']`);
    expect(t('run.settings.autoLap.rangeKm', { km: (0.1).toFixed(1) })).toBe(`${(0.1).toFixed(1)} ק"מ`);
    expect(t('run.settings.autoLap.rangeMin', { min: '1' })).toBe(`1 דק'`);
    expect(t('run.settings.autoLap.rangeMin', { min: '10' })).toBe(`10 דק'`);
  });

  it('commute + elevation strip', () => {
    expect(t('run.commute.remainingM', { m: String(Math.round(0.45 * 1000)) })).toBe(`${Math.round(0.45 * 1000)} מ׳`);
    expect(t('run.commute.remainingKm', { km: (12.34).toFixed(1) })).toBe(`${(12.34).toFixed(1)} ק״מ`);
    expect(t('run.elevationAhead.progress', { done: (1.05).toFixed(1), total: (4).toFixed(1) }))
      .toBe(`ק״מ ${(1.05).toFixed(1)} מתוך ${(4).toFixed(1)}`);
  });

  it('workout preview screen', () => {
    expect(t('run.preview.pacePerKm', { pace: '4:30–4:45' })).toBe(`${'4:30–4:45'} /ק"מ`);
    expect(t('run.preview.runnersNearby', { n: String(1234) })).toBe(`${1234} אנשים רצים קרוב אליך`);
    expect(t('run.preview.block.seconds', { s: '45' })).toBe(`${45} שנ'`);
    expect(t('run.preview.block.minutes', { m: `${3}:${(30).toString().padStart(2, '0')}` })).toBe(`${3}:${(30).toString().padStart(2, '0')} דק'`);
    expect(t('run.preview.block.minutes', { m: '5' })).toBe(`${5} דק'`);
    expect(t('run.preview.block.km', { km: (1600 / 1000).toFixed(1) })).toBe(`${(1600 / 1000).toFixed(1)} ק"מ`);
    expect(t('run.preview.block.meters', { m: '400' })).toBe(`${400} מ'`);
    expect(t('run.preview.total.seconds', { s: '50' })).toBe(`${50} שניות`);
    expect(t('run.preview.total.minutes', { m: '42' })).toBe(`~${42} דק'`);
    expect(t('run.preview.total.km', { km: (8400 / 1000).toFixed(1) })).toBe(`${(8400 / 1000).toFixed(1)} ק"מ`);
    expect(t('run.preview.total.meters', { m: '800' })).toBe(`${800} מ'`);
  });

  it('run overview (v2)', () => {
    expect(t('run.overview.map.title', { type: 'אינטרוולים קצרים', route: 'לולאת הירקון' })).toBe(`${'אינטרוולים קצרים'} על ${'לולאת הירקון'}`);
    expect(t('run.overview.header.typeCustomized', { type: 'טמפו' })).toBe(`${'טמפו'} · מותאם`);
    for (const n of [1, 3]) {
      const label = '6 × 400';
      expect(t('run.overview.suggest.pillLoops', { n, label })).toBe(`${n === 1 ? 'לולאה אחת' : `${n} לולאות`} מכאן ל-${label}`);
      expect(t('run.overview.suggest.pillRoutes', { n, label })).toBe(`${n === 1 ? 'מסלול אחד' : `${n} מסלולים`} מכאן ל-${label}`);
    }
    expect(t('run.overview.suggest.minutes', { min: '42' })).toBe(`${42} דק׳`);
    expect(t('run.overview.suggest.km', { km: (4.04).toFixed(1) })).toBe(`${(4.04).toFixed(1)} ק״מ`);
    expect(t('run.overview.level.withMinutes', { name: 'קליל', min: String(Math.max(1, Math.round(1830 / 60))) }))
      .toBe(`${'קליל'} · ${Math.max(1, Math.round(1830 / 60))}׳`);
    expect(t('run.overview.finishAt', { clock: '09:26' })).toBe(`מסיים ~${'09:26'}`);
    expect(t('run.overview.swap.confirmTo', { title: '4 × 600 מ׳' })).toBe(`החלף ל-${'4 × 600 מ׳'}`);
    expect(t('run.overview.pace.subtitle', { subtitle: 'חזרות 400 · 6 ×' })).toBe(`${'חזרות 400 · 6 ×'} · לאימון הזה בלבד`);
    expect(t('run.overview.pace.reset', { band: '4:30–4:45' })).toBe(`איפוס לקצב שלך (${'4:30–4:45'})`);
    expect(t('run.overview.pace.unitPerRep', { clock: '1:52' })).toBe(`דק׳ לק״מ · ~${'1:52'} לחזרה`);
    const tag = (c: unknown[]) => `[${c.join('')}]`;
    expect(t.rich('run.overview.pace.yourRange', { band: '4:30–4:45', bdi: tag }).join('')).toBe('הטווח שלך: [4:30–4:45]');
    expect(t('run.overview.edit.paceAria', { pace: '4:30–4:40' })).toBe(`התאם קצב ${'4:30–4:40'}`);
    expect(t('run.overview.edit.pacePerKm', { pace: '6:05' })).toBe(`${'6:05'} /ק״מ`);
    expect(t('run.overview.edit.swappedFrom', { from: '6 × 400 מ׳' })).toBe(`הוחלף · היה ${'6 × 400 מ׳'}`);
    expect(t('run.overview.fitCard.sub', { fit: 'מתאים', min: '42' })).toBe(`${'מתאים'} · ${42} דק׳`);
    expect(t('run.overview.fitCard.today', { title: '6 × 400 מ׳' })).toBe(`יש לך היום: ${'6 × 400 מ׳'}`);
  });

  it('no key is left untested', () => {
    // Keep in step with the catalog: a new run.* key needs a case above. Counted per prefix
    // (other batches add keys to the same namespace file — e.g. sessionInvite.*, app-pages-he.test.ts).
    expect(Object.keys(he).filter((k) => k.startsWith('run.')).length).toBe(320);
  });
});
