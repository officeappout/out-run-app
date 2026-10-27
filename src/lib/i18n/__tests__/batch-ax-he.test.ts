/**
 * i18n batch ax: every new key of the hybrid station / v2 player, hybrid axis, v2 summary mappings, workout overview page
 * and preview section titles equals the OLD literal / template (copied verbatim from the code before the extraction) —
 * including the branches a static render does not reach (gender selects, click states, plural, a count >= 1000).
 */
import { describe, expect, it } from 'vitest';
import { player } from '@/messages/ns/player';
import { map } from '@/messages/ns/map';
import { summary } from '@/messages/ns/summary';
import { library } from '@/messages/ns/library';
import { makeT } from '../t';
import { guidanceLine, welcomeCta, welcomeGreeting } from '@/features/workout-engine/hybrid/guided-station';
import { walkingLine } from '@/features/workout-engine/hybrid/hybrid-walk-state';
import { stationTutorialEntrySteps, stationTutorialSteps } from '@/features/workout-engine/hybrid/station-tutorial';
import { setCounterLabel } from '@/features/workout-engine/players/strength/logic/player-controls.utils';
import { recenterControlLabel } from '@/app/map/recenter-control';

const p = makeT('he', player);
const m = makeT('he', map);
const s = makeT('he', summary);
const l = makeT('he', library);
const GENDERS = ['female', 'male', 'other'] as const;

describe('batch ax — player (hybrid.*)', () => {
  it('plain strings', () => {
    const cases: Array<[Parameters<typeof p>[0], string]> = [
      ['hybrid.parkFallback', 'גינת כושר'],
      ['hybrid.cta.arrive', 'הגעתי לתחנה'],
      ['hybrid.cta.finish', 'סיים אימון משולב'],
      ['hybrid.layer.skip', 'דלג על התחנה'],
      ['hybrid.layer.arrived', 'הגעתי'],
      ['hybrid.layer.intro', '🚶 התחל ללכת'],
      ['hybrid.complete.title', 'סיימת את התחנה!'],
      ['hybrid.complete.next', 'התחנה הבאה'],
      ['hybrid.complete.fastAccepted', 'עברנו למצב מהיר · אפשר לשנות בהגדרות'],
      ['hybrid.complete.fastAsk', 'כבר הבנת? לעבור למצב מהיר'],
      ['hybrid.complete.fastYes', 'כן, למצב מהיר'],
      ['hybrid.complete.fastNo', 'לא עכשיו'],
      ['hybrid.complete.continue', 'המשך במסלול'],
      ['hybrid.welcome.chip.time', 'זמן'],
      ['hybrid.welcome.chip.reps', 'חזרות'],
      ['hybrid.v2.transition.paused', 'המעבר מושהה'],
      ['hybrid.v2.transition.going', 'עוברים לכוח'],
      ['hybrid.v2.transition.firstExercise', 'התרגיל הראשון'],
      ['hybrid.v2.transition.skip', 'דלג'],
      ['hybrid.v2.transition.extendAria', 'עוד 20 שניות מנוחה'],
      ['hybrid.v2.transition.resumeAria', 'המשך הספירה'],
      ['hybrid.v2.transition.pauseAria', 'השהה את הספירה'],
      ['hybrid.v2.transition.start', 'התחל עכשיו'],
      ['hybrid.v2.run.finish', 'סיום'],
      ['hybrid.v2.list.status.active', 'עכשיו'],
      ['hybrid.v2.mini.transition', 'מעבר לכוח'],
      ['hybrid.v2.header.done', 'האימון הסתיים'],
    ];
    for (const [key, old] of cases) expect(p(key)).toBe(old);
  });

  it('values', () => {
    const km = 1234;
    expect(p('hybrid.layer.introWithDistance', { distance: '300 מ׳' })).toBe(`🚶 התחל ללכת — בעוד ${'300 מ׳'} יש גינת כושר`);
    for (const n of [0, 1, 2, 12, km]) {
      expect(p('hybrid.complete.exercises', { n })).toBe(n === 1 ? 'תרגיל אחד' : `${n} תרגילים`);
    }
    expect(p('hybrid.complete.in', { time: '7 דק׳ הליכה' })).toBe(`בעוד ${'7 דק׳ הליכה'}`);
    expect(p('hybrid.welcome.stationOf', { number: '1', total: '3' })).toBe(`תחנה ${1} מתוך ${3}`);
    expect(p('hybrid.welcome.estimate', { time: '14 דק׳' })).toBe(` · כ-${'14 דק׳'}`);
    expect(p('hybrid.v2.ranDone', { kind: 'walking', distance: '2.00 ק״מ', time: '10:00' })).toBe('הליכה הושלמה · 2.00 ק״מ · 10:00');
    expect(p('hybrid.v2.ranDone', { kind: 'running', distance: '2.00 ק״מ', time: '10:00' })).toBe('ריצה הושלמה · 2.00 ק״מ · 10:00');
    expect(p('hybrid.v2.ranDone', { kind: 'cycling', distance: '2.00 ק״מ', time: '10:00' })).toBe('ריצה הושלמה · 2.00 ק״מ · 10:00');
    expect(p('hybrid.v2.transition.extend', { sec: '20' })).toBe(`${20} שנ׳`);
    expect(p('hybrid.v2.transition.setOf', { sets: '3' })).toBe(`סט 1 מתוך ${3}`);
    expect(p('hybrid.v2.transition.more', { n: '2' })).toBe(`עוד ${2} תרגילים`);
    expect(p('hybrid.v2.run.arriveNamed', { label: 'בלוק כוח · פארק' })).toBe(`הגעתי · ${'בלוק כוח · פארק'}`);
    expect(p('hybrid.v2.list.subtitle', { eyebrow: 'ריצה + כוח', count: '3' })).toBe(`${'ריצה + כוח'} · ${3} בלוקים`);
    expect(p('hybrid.v2.overlay.cartAria', { count: '2' })).toBe(`מהלך האימון · ${2} הושלמו`);
    expect(p('hybrid.v2.label.stationNamed', { name: 'פארק' })).toBe('תחנת כוח · פארק');
    expect(p('hybrid.v2.label.station')).toBe('תחנת כוח');
    expect(p('hybrid.v2.label.toNamed', { verb: 'ריצה', name: 'פארק' })).toBe('ריצה אל פארק');
    expect(p('hybrid.v2.label.toStation', { verb: 'הליכה' })).toBe('הליכה אל התחנה');
    for (const [kind, old] of [['walking', 'הליכת שחרור'], ['cycling', 'רכיבת שחרור'], ['running', 'ריצת שחרור']] as const) {
      expect(p('hybrid.v2.label.cooldown', { kind })).toBe(old);
    }
    for (const [kind, old] of [['cycling', 'רכיבה'], ['walking', 'הליכה'], ['running', 'ריצה קלה']] as const) {
      expect(p('hybrid.v2.zone.fallback', { kind })).toBe(old);
    }
    expect(p('hybrid.v2.header.session', { verb: 'רכיבה' })).toBe('רכיבה + כוח');
    expect(p('hybrid.v2.header.of', { n: '2', total: '3' })).toBe(`${2} מתוך ${3}`);
    expect(p('hybrid.v2.header.transition', { of: '2 מתוך 3' })).toBe(`מעבר לכוח · ${'2 מתוך 3'}`);
    expect(p('hybrid.v2.header.titleOf', { label: 'ריצה אל פארק', of: '1 מתוך 3' })).toBe(`${'ריצה אל פארק'} · ${'1 מתוך 3'}`);
    expect(p('hybrid.v2.next.label', { name: 'פארק' })).toBe('בלוק כוח · פארק');
    expect(p('hybrid.v2.next.labelBare')).toBe('בלוק כוח');
    expect(p('hybrid.v2.meta.exercises', { n: String(km) })).toBe(`${km} תרגילים`);
    expect(p('hybrid.v2.meta.sets', { n: String(km) })).toBe(`${km} סטים`);
    expect(p('hybrid.v2.reps.range', { min: '6', max: '8', unit: 'reps' })).toBe('6–8 חזרות');
    expect(p('hybrid.v2.reps.range', { min: '20', max: '40', unit: 'seconds' })).toBe('20–40 שנ׳');
    expect(p('hybrid.v2.reps.value', { value: '30', unit: 'seconds' })).toBe('30 שנ׳');
    expect(p('hybrid.v2.reps.value', { value: '8', unit: 'reps' })).toBe('8 חזרות');
    expect(p('hybrid.v2.list.status.done')).toBe('הושלם');
    expect(p('hybrid.v2.list.status.skipped')).toBe('דילגת');
    expect(p('hybrid.v2.list.notStarted')).toBe('עוד לא התחיל');
    expect(p('hybrid.v2.list.pacePerKm', { pace: '5:33' })).toBe(`${'5:33'} לק״מ`);
    expect(p('hybrid.v2.list.repsCount', { n: '6' })).toBe(`${6} חזרות`);
    expect(p('hybrid.v2.list.setsDone', { done: '3', planned: '7' })).toBe(`${3}/${7} סטים`);
    expect(p('strengthPlayer.header.setCounter', { current: '2', total: '4' })).toBe(`סט ${2} מתוך ${4}`);
  });

  it('guided copy: every gender (old g() helper re-declared)', () => {
    const g = (gender: string | null | undefined, male: string, female: string, other?: string) =>
      gender === 'female' ? female : gender === 'other' ? (other ?? male) : male;
    for (const gender of GENDERS) {
      expect(guidanceLine('reps', gender, 10)).toBe(g(gender, 'עשה 10 חזרות בקצב שלך, ואז לחץ סיימתי', 'עשי 10 חזרות בקצב שלך, ואז לחצי סיימתי'));
      expect(guidanceLine('reps', gender)).toBe(g(gender, 'עשה חזרות בקצב שלך, ואז לחץ סיימתי', 'עשי חזרות בקצב שלך, ואז לחצי סיימתי'));
      expect(guidanceLine('reps', gender, '  ')).toBe(g(gender, 'עשה חזרות בקצב שלך, ואז לחץ סיימתי', 'עשי חזרות בקצב שלך, ואז לחצי סיימתי'));
      expect(guidanceLine('time', gender)).toBe('ממשיכים עד שהטיימר נגמר');
      expect(welcomeCta(gender)).toBe('מתחילים');
      const reps = g(gender, 'חזרות: אתה סופר ולוחץ סיימתי', 'חזרות: את סופרת ולוחצת סיימתי', 'חזרות: סופרים ולוחצים סיימתי');
      expect(stationTutorialSteps(gender)[1].legend?.[1].text).toBe(reps);
      expect(stationTutorialEntrySteps(gender)[1].text).toBe(
        g(gender, 'בזמן אנחנו סופרים. בחזרות אתה סופר ולוחץ סיימתי', 'בזמן אנחנו סופרים. בחזרות את סופרת ולוחצת סיימתי', 'בזמן אנחנו סופרים. בחזרות סופרים ולוחצים סיימתי'),
      );
      const first = g(gender, 'התחל ללכת', 'התחילי ללכת', 'מתחילים ללכת');
      const next = g(gender, 'המשך ללכת', 'המשיכי ללכת', 'ממשיכים ללכת');
      expect(walkingLine(gender, 1, 350)).toBe(`${first} · בעוד 350 מ׳ תחנה ראשונה`);
      expect(walkingLine(gender, null, 80)).toBe(`${first} · בעוד 80 מ׳ תחנה ראשונה`);
      expect(walkingLine(gender, 2, 1200)).toBe(`${next} · בעוד 1.2 ק"מ התחנה הבאה`);
      expect(walkingLine(gender, 1, null)).toBe(`${first} · לתחנה הראשונה`);
      expect(walkingLine(gender, 3, null)).toBe(`${next} · לתחנה הבאה`);
    }
    expect(welcomeGreeting()).toBe('כל הכבוד, הגעת!');
    const steps = stationTutorialSteps('male');
    expect(steps.map((x) => x.text)).toEqual(['כשמוכנים, לוחצים כאן', 'כל תרגיל מסומן לפי הסוג שלו', 'בכל רגע אפשר לעצור או לדלג על תרגיל או על כל התחנה']);
    expect(steps[1].legend?.[0].text).toBe('זמן: אנחנו סופרים');
    expect(steps[2].legend?.map((x) => x.text)).toEqual(['עצירה', 'דילוג']);
    const entry = stationTutorialEntrySteps('female');
    expect(entry.map((x) => x.title)).toEqual(['מתחילים', 'זמן או חזרות', 'עצירה ודילוג']);
  });

  it('set counter label', () => {
    expect(setCounterLabel(1, 3, 4)).toBe('סט 2 מתוך 4');
    expect(setCounterLabel(-1, 9, 4)).toBe('סט 4 מתוך 4');
    expect(setCounterLabel(-1, 1, 1)).toBeNull();
  });
});

describe('batch ax — map (hybrid.axis.*, hybrid.questionnaire.*, recenter.*)', () => {
  it('zone badge: every zone and the fallback', () => {
    const old: Record<string, string> = {
      jogging: 'ריצה קלה', easy: 'קל', recovery: 'שחרור', walk: 'הליכה',
      tempo: 'טמפו', long_run: 'ריצה ממושכת', fartlek_medium: 'פרטלק', fartlek_fast: 'פרטלק מהיר',
    };
    for (const zone of [...Object.keys(old), 'bogus', 'undefined']) expect(m('hybrid.axis.zone', { zone })).toBe(old[zone] ?? 'אירובי');
  });
  it('leg copy', () => {
    expect(m('hybrid.axis.walkThere')).toBe('הליכה אל המסלול');
    expect(m('hybrid.axis.walkBack')).toBe('הליכה חזרה');
    expect(m('hybrid.axis.toStation', { name: 'גינה' })).toBe(`אל ${'גינה'}`);
    expect(m('hybrid.axis.backToStart')).toBe('חזרה לנקודת ההתחלה');
    expect(m('hybrid.axis.continue')).toBe('המשך');
    expect(m('hybrid.axis.metaAll', { action: 'ריצה', km: '1.20', time: '15 דק׳' })).toBe('ריצה · 1.20 ק״מ · 15 דק׳');
    expect(m('hybrid.axis.metaAll', { action: 'ריצה', km: '—', time: '15 דק׳' })).toBe('ריצה · — ק״מ · 15 דק׳');
    expect(m('hybrid.axis.legTitle', { action: 'הליכה', n: '2' })).toBe('הליכה · מקטע 2');
    expect(m('hybrid.axis.km', { km: '1.20' })).toBe('1.20 ק״מ');
  });
  it('questionnaire nudge and recenter labels', () => {
    for (const gender of GENDERS) {
      expect(m('hybrid.questionnaire.nudge', { gender })).toBe(
        gender === 'female' ? 'רוצה אימון מותאם יותר? מלאי שאלון כוח קצר' : gender === 'male' ? 'רוצה אימון מותאם יותר? מלא שאלון כוח קצר' : 'אימון מותאם יותר? שאלון כוח קצר',
      );
    }
    expect(m('hybrid.questionnaire.locked')).toBe('שאלון כוח קצר יפתח את תחנות הכוח במסלול — למלא עכשיו');
    expect(recenterControlLabel(false, 'course')).toBe('מרכז אותי');
    expect(recenterControlLabel(false, 'north')).toBe('מרכז אותי');
    expect(recenterControlLabel(true, 'course')).toBe('כיוון הליכה');
    expect(recenterControlLabel(true, 'north')).toBe('צפון למעלה');
  });
});

describe('batch ax — summary (mapping.*, identity.*)', () => {
  it('mapping labels', () => {
    expect(s('mapping.speed')).toBe('מהירות ממוצעת');
    expect(s('mapping.climb')).toBe('טיפוס מצטבר');
    expect(s('mapping.of', { value: '4.0 ק״מ' })).toBe(`מתוך ${'4.0 ק״מ'}`);
    expect(s('mapping.done')).toBe('הושלמו');
    expect(s('mapping.station.single')).toBe('תחנת כוח');
    expect(s('mapping.station.numbered', { n: '2' })).toBe(`תחנת כוח ${2}`);
    expect(s('mapping.rep.target', { band: '4:45–4:55' })).toBe(`יעד ${'4:45–4:55'}`);
    expect(s('mapping.rep.inRange', { inRange: '5', scored: '6' })).toBe(`${5} מתוך ${6} חזרות בטווח`);
    for (const [kind, old] of [['intervals', 'אינטרוולים'], ['long', 'ריצה ארוכה'], ['easy', 'ריצה קלה'], ['free', 'ריצה']] as const) {
      expect(s('mapping.heroFallback', { kind })).toBe(old);
    }
    expect(s('mapping.reps')).toBe('חזרות');
    expect(s('mapping.repPace')).toBe('קצב חזרה');
    expect(s('mapping.band', { band: '6:20–6:50' })).toBe(`טווח ${'6:20–6:50'}`);
    expect(s('mapping.timeInZone')).toBe('זמן בטווח');
    expect(s('mapping.split.full', { label: '3' })).toBe(`ק״מ ${'3'}`);
    expect(s('mapping.split.partial', { label: '3.5' })).toBe(`${'3.5'} ק״מ (חלקי)`);
    expect(s('mapping.split.fastest')).toBe('הכי מהיר');
    expect(s('mapping.split.fastestLabel', { km: '12' })).toBe(`הכי מהיר: ק״מ ${12}`);
    expect(s('mapping.course.warmup')).toBe('חימום');
    expect(s('mapping.course.rep', { n: '1' })).toBe(`חזרה ${1}`);
    expect(s('mapping.course.reps', { from: '4', to: '6' })).toBe(`חזרות ${4}–${6}`);
    expect(s('mapping.course.cooldown')).toBe('שחרור');
    expect(s('mapping.plan.name')).toBe('תוכנית ריצה');
    expect(s('mapping.plan.week', { week: '2', weeks: '8' })).toBe(`שבוע ${2}/${8}`);
    expect(s('mapping.plan.position', { pos: '2', total: '4' })).toBe(`אימון ${2} מתוך ${4} השבוע`);
    expect(s('mapping.plan.next', { name: 'ריצה קלה' })).toBe(`הבא: ${'ריצה קלה'}`);
    expect(s('mapping.extra.ascent')).toBe('עלייה');
    expect(s('mapping.extra.lastKm')).toBe('ק״מ אחרון');
  });
  it('identity row', () => {
    expect(s('identity.xp')).toBe('XP');
    expect(s('identity.inline', { time: '42:18', cal: '312' })).toBe(`${'42:18'} · ${312} קק״ל`);
    expect(s('identity.inlineXp', { time: '42:18', cal: '312', xp: '1234' })).toBe(`${'42:18'} · ${312} קק״ל · +${1234} XP`);
  });
});

describe('batch ax — library (workout overview page, section titles, expandable text)', () => {
  it('strings', () => {
    expect(l('preview.section.title.warmup')).toBe('חימום');
    expect(l('preview.section.title.superset')).toBe('סופר סט');
    expect(l('preview.section.title.regular')).toBe('סט רגיל');
    expect(l('preview.section.title.cooldown')).toBe('מתיחות');
    expect(l('preview.section.tabata.title')).toBe('טבטה');
    expect(l('workouts.expandable.less')).toBe('הצג פחות');
    expect(l('workouts.expandable.more')).toBe('קרא עוד');
    expect(l('workouts.expandable.moreDots')).toBe('קרא עוד...');
    expect(l('workoutOverview.back')).toBe('חזור');
    expect(l('workoutOverview.name')).toBe('אימון כוח');
    expect(l('workoutOverview.segment.warmup')).toBe('חימום');
    expect(l('workoutOverview.segment.strength')).toBe('תרגילי כוח');
    expect(l('workoutOverview.segment.cooldown')).toBe('קירור');
    expect(l('workoutOverview.seconds', { n: '60' })).toBe('60 שניות');
    expect(l('workoutOverview.seconds', { n: '45' })).toBe('45 שניות');
    expect(l('workoutOverview.reps', { n: '12' })).toBe('12 חזרות');
    expect(l('sharedWorkout.loading')).toBe('טוען את האימון...');
    expect(l('sharedWorkout.error.title')).toBe('לא הצלחנו לטעון את האימון');
    expect(l('sharedWorkout.error.home')).toBe('חזרה לדף הבית');
    expect(l('preview.list.share')).toBe('שתף');
  });
});
