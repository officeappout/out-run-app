/**
 * Namespace `map` — the map / parks UI in src/features/parks/core/components (i18n wave 2): every Hebrew key
 * returns exactly what the code rendered before the extraction. The `old` side of each case is the original
 * literal / template expression, copied verbatim from the components (git show origin/main:<file>).
 *
 * The parity snapshots (src/features/parks/core/components/__tests__/parks-core-i18n*-parity.test.tsx) cover
 * the keys in context; this test also pins every select / plural branch, counts >= 1000 and the copy no render
 * reaches (the generation error fallback, the hold-to-stop hint, the station's per-side label).
 * Own file (not a describe in map-he.test.ts) so parallel map batches don't conflict.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/map.json';
import { map } from '@/messages/ns/map';
import { makeT } from '../t';

const t = makeT('he', map);
type Key = keyof typeof he;

describe('map (he) — parks/core map UI, byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['journey.cta.go', 'צא לדרך'],
      ['marker.labelEmpty', 'יעד'],
      ['searchBar.placeholder', 'לאן הולכים?'],
      ['legPlan.startNowLabel', 'התחל ריצה עכשיו'],
      ['legPlan.ready', '🏁 המסלול מוכן — מתחילים...'],
      ['legPlan.cta', 'התחל עכשיו'],
      ['layers.title', 'שכבות במפה'],
      ['layers.close', 'סגור'],
      ['layers.option.water', 'ברזיות מים'],
      ['layers.option.gym', 'מתקני כושר'],
      ['layers.option.toilet', 'שירותים ציבוריים'],
      ['layers.live.open', 'פתח פילטרים של משתמשים פעילים'],
      ['layers.live.title', 'משתמשים פעילים'],
      ['layers.live.off', 'אין סינון פעיל'],
      ['layers.live.all', 'הכל'],
      ['modes.discover', 'גלה מסלולים'],
      ['modes.freeRun', 'אירובי חופשי'],
      ['modes.partners', 'שותפים לאימון'],
      ['navBanner.approach.headline', 'הליכה אל המסלול'],
      ['navBanner.approach.action', 'עד הנקודה הקרובה במסלול'],
      ['navBanner.expand', 'הצג את כל הפניות'],
      ['navBanner.minimize', 'מזעור ניווט'],
      ['navBanner.progress.nameFallback', 'התקדמות במסלול'],
      ['navBanner.progress.barLabel', 'התקדמות במסלול'],
      ['routeCard.recommended', 'מומלץ'],
      ['routeCard.loading', 'טוען...'],
      ['carousel.dialogLabel', 'בחירת מסלול'],
      ['carousel.error.generateFailed', 'יצירת המסלולים נכשלה'],
      ['carousel.activity.walking', 'הליכה'],
      ['carousel.activity.running', 'ריצה'],
      ['carousel.activity.cycling', 'רכיבה'],
      ['carousel.activityPicker', 'בחר אופן תנועה'],
      ['carousel.searching.commute', 'מחשב מסלולים אל היעד…'],
      ['carousel.searching.loop', 'מחפש מסלולים קרובים…'],
      ['carousel.searching.commuteSub', 'בודק מהיר, חלופי ושקט'],
      ['carousel.searching.loopSub', 'סורק את הרחובות הסמוכים אליך'],
      ['carousel.cancel', 'ביטול'],
      ['carousel.empty.commute', 'לא הצלחנו לחשב מסלול אל היעד כרגע'],
      ['carousel.empty.commuteHint', 'נסה יעד אחר או החלף סוג פעילות.'],
      ['carousel.empty.loopHint', 'נסה לשנות את המרחק או את סוג הפעילות.'],
      ['carousel.back.commute', 'חזור לחיפוש'],
      ['carousel.back.loop', 'חזור להגדרות'],
      ['carousel.close', 'סגור ניווט'],
      ['carousel.card.nameFallback', 'סיבוב מעגלי'],
      // gender batch 1: carousel.card.start is a gender select — pinned below
      ['mapSearch.placeholder', 'כתובת, רחוב, פארק או מסלול'],
      ['mapSearch.clear', 'נקה חיפוש'],
      ['mapSearch.cancel', 'ביטול'],
      ['mapSearch.saved.unset', 'הקש להגדרה'],
      ['mapSearch.recents.title', 'אחרונים'],
      ['mapSearch.recents.clear', 'נקה'],
      ['mapSearch.nearby', 'קרוב אליך'],
      ['mapSearch.none.title', 'לא נמצאו תוצאות'],
      ['mapSearch.none.hint', 'נסו כתובת, שם רחוב, פארק או מסלול'],
      ['pick.sheetLabel', 'תוצאת חיפוש'],
      ['pick.close', 'סגור'],
      ['pick.place.typeFallback', 'מיקום'],
      ['pick.action.runHere', 'ריצה לכאן'],
      ['pick.action.walkHere', 'הליכה לכאן'],
      ['pick.action.save', 'שמור מקום'],
      ['pick.navigateHere', 'נווט לכאן'],
      ['pick.route.stat.length', 'אורך'],
      ['pick.route.stat.climb', 'עלייה'],
      ['pick.route.navigateToStart', 'נווט להתחלה'],
      ['pick.route.details', 'פרטי המסלול'],
      ['session.holdToStop', 'החזק לעצירה'],
      ['hybrid.split.recommended', 'מומלץ'],
      ['hybrid.split.label', 'יחס אירובי לעומת כוח'],
      ['hybrid.station.locked', 'תחנה נעולה'],
      ['hybrid.station.stopAndTrain', 'עצור ואמן'],
      ['hybrid.station.withWarmup', 'כולל חימום'],
      ['hybrid.station.perSide', ' (לכל צד)'],
      ['hybrid.titleBar.eyebrow', 'מבט על אימון'],
      ['hybrid.titleBar.back', 'חזרה'],
      ['hybrid.stationsToggle.label', 'תחנות כוח בדרך'],
      ['overview.shell.back', 'חזור'],
      ['overview.axis.start', 'תחילת המסלול'],
      ['overview.axis.end', 'סיום המסלול'],
      ['overview.axis.yourLocation', 'המיקום שלך'],
      ['overview.axis.loopNote', 'מסלול מעגלי — חוזר לנקודת ההתחלה'],
      ['overview.axis.reps', 'חזרות'],
      ['overview.roundTrip.off', 'הוסף הליכה הלוך וחזור'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('templates (values, counts >= 1000 stay unformatted)', () => {
    const km = (1234.56).toFixed(1);
    expect(t('journey.distance', { km })).toBe(`${km} ק״מ`);
    expect(t('journey.duration', { min: String(1234) })).toBe(`${1234} דק׳`);
    const label = 'הרצל 14';
    expect(t('marker.label', { label })).toBe(`יעד: ${label}`);
    expect(t('legPlan.summary', { legs: String(3), km: (5.46).toFixed(1), min: String(33) }))
      .toBe(`${3} עצירות · ${(5.46).toFixed(1)} ק״מ · ${33} דק׳`);
    expect(t('layers.live.metres', { m: String(Math.round(0.5 * 1000)) })).toBe(`${Math.round(0.5 * 1000)} מ׳`);
    expect(t('layers.live.km', { km: String(2.5) })).toBe(`${2.5} ק״מ`);
    expect(t('layers.live.km', { km: String(1234) })).toBe(`${1234} ק״מ`);
    expect(t('modes.withCount', { label: 'שותפים לאימון', count: String(1234) })).toBe(`${'שותפים לאימון'} · ${1234}`);
    expect(t('navBanner.progress.joined', { pct: String(42), remaining: '1.8 ק״מ' })).toBe(`${42}% · נותרו ${'1.8 ק״מ'}`);
    expect(t('navBanner.progress.total', { total: '3.2 ק״מ' })).toBe(`${'3.2 ק״מ'} במסלול`);
    const destinationLabel = 'הרצל 14';
    const cityName = 'תל אביב';
    expect(t('carousel.searching.commuteTo', { destination: destinationLabel })).toBe(`מחשב מסלולים אל ${destinationLabel}…`);
    expect(t('carousel.searching.loopIn', { city: cityName })).toBe(`מחפש מסלולים ב${cityName}…`);
    expect(t('carousel.empty.commuteTo', { destination: destinationLabel })).toBe(`לא הצלחנו לחשב מסלול אל ${destinationLabel} כרגע`);
    expect(t('carousel.empty.loop', { km: (4.25).toFixed(1) })).toBe(`לא הצלחנו ליצור מסלול ${(4.25).toFixed(1)} ק״מ קרוב אליך כרגע`);
    for (const n of [1, 3, 1234]) {
      expect(t('carousel.title.commuteTo', { count: String(n), destination: destinationLabel })).toBe(`${n} דרכים אל ${destinationLabel}`);
      expect(t('carousel.title.commute', { count: String(n) })).toBe(`${n} דרכים אל היעד`);
      expect(t('carousel.title.loop', { count: String(n) })).toBe(`${n} מסלולים מותאמים אישית`);
      expect(t('mapSearch.filterAll', { count: String(n) })).toBe(`הכל · ${n}`);
      expect(t('mapSearch.more', { count: String(n) })).toBe(`עוד ${n}`);
      expect(t('hybrid.station.exercises', { count: String(n) })).toBe(`${n} תרגילים`);
    }
    expect(t('carousel.card.distance', { km: (3.04).toFixed(1) })).toBe(`${(3.04).toFixed(1)} ק״מ`);
    expect(t('carousel.card.duration', { min: String(21.5) })).toBe(`~${21.5} דק׳`);
    const primary = 'פארק הירקון';
    expect(t('mapSearch.recents.remove', { name: primary })).toBe(`הסר את ${primary} מההיסטוריה`);
    expect(t('pick.place.fromYou', { distance: '1.5 ק״מ' })).toBe(`${'1.5 ק״מ'} ממך`);
    // JSX was `<Icon /> ריצה {eta}` — the leading space stays in the JSX (`{' '}`), the key starts at the word.
    expect(t('pick.eta.run', { eta: '~11 דק׳' })).toBe(`ריצה ${'~11 דק׳'}`);
    expect(t('pick.eta.walk', { eta: '~23 דק׳' })).toBe(`הליכה ${'~23 דק׳'}`);
    for (const kindLabel of ['בית', 'עבודה']) {
      expect(t('pick.action.savedAs', { label: kindLabel })).toBe(`נשמר כ${kindLabel}`);
      expect(t('pick.save.replace', { label: kindLabel })).toBe(`החלף ${kindLabel}`);
      expect(t('pick.save.as', { label: kindLabel })).toBe(`שמור כ${kindLabel}`);
    }
    expect(t('pick.route.startFromYou', { distance: '800 מ׳' })).toBe(`ההתחלה ${'800 מ׳'} ממך`);
    expect(t('pick.route.stat.lengthValue', { km: (4.3).toFixed(1) })).toBe(`${(4.3).toFixed(1)} ק״מ`);
    expect(t('pick.route.stat.durationValue', { min: String(Math.round(1234.4)) })).toBe(`~${Math.round(1234.4)} דק׳`);
    expect(t('pick.route.stat.climbValue', { m: String(Math.round(1234.4)) })).toBe(`+${Math.round(1234.4)} מ׳`);
    for (const pct of [30, 50, 70]) {
      expect(t('hybrid.split.aerobic', { pct: String(pct) })).toBe(`אירובי ${pct}%`);
      expect(t('hybrid.split.strength', { pct: String(100 - pct) })).toBe(`כוח ${100 - pct}%`);
    }
    const stationName = 'גינת כושר הירקון';
    expect(t('hybrid.station.titleNamed', { name: stationName })).toBe(`${stationName} — כוח`);
    expect(t('hybrid.station.titleOrdinal', { n: String(2) })).toBe(`תחנה ${2} — כוח`);
    expect(t('overview.axis.pace', { pace: '5:30' })).toBe(`${'5:30'} /ק״מ`);
    expect(t('overview.axis.watchVideo', { name: 'ברכיים גבוהות' })).toBe(`צפה בסרטון: ${'ברכיים גבוהות'}`);
    expect(t('overview.roundTrip.on', { min: String(12) })).toBe(`הלוך וחזור · כולל ${12} דק׳ הליכה אל המסלול וממנו`);
  });

  it('selects and plurals — every branch of the old lookup / ternary', () => {
    // MapLayersControl: ACTIVITY_LABELS[liveActivity] ?? 'הכל', then `${label} · עד ${distanceLabel}`.
    const ACTIVITY_LABELS: Record<string, string> = { all: 'הכל', strength: 'כוח', running: 'ריצה', walking: 'הליכה' };
    for (const a of ['all', 'strength', 'running', 'walking', 'cycling', '']) {
      expect(t('layers.live.summary', { activity: a, distance: '3 ק״מ' })).toBe(`${ACTIVITY_LABELS[a] ?? 'הכל'} · עד ${'3 ק״מ'}`);
    }
    // SearchOverlayV2: kind === 'home' ? 'בית' : 'עבודה'.
    for (const kind of ['home', 'work']) expect(t('mapSearch.saved.kind', { kind })).toBe(kind === 'home' ? 'בית' : 'עבודה');
    // SearchPickCards: nearRoutes.length === 1 ? … : `${n} מסלולים עוברים ליד` (the list is official routes within 1 km — small).
    for (const n of [1, 2, 7]) {
      expect(t('pick.nearRoutes', { count: n })).toBe(n === 1 ? 'מסלול עובר ליד' : `${n} מסלולים עוברים ליד`);
    }
    // SearchPickCards: ACTIVITY_WORD[route.activityType ?? route.type] ?? ACTIVITY_WORD.running.
    const ACTIVITY_WORD: Record<string, { label: string; cta: string }> = {
      walking: { label: 'הליכה', cta: 'התחל הליכה במסלול' },
      cycling: { label: 'רכיבה', cta: 'התחל רכיבה במסלול' },
      running: { label: 'ריצה', cta: 'התחל ריצה במסלול' },
    };
    for (const activity of ['walking', 'cycling', 'running', 'workout', '']) {
      const act = ACTIVITY_WORD[activity] ?? ACTIVITY_WORD.running;
      expect(t('pick.route.eyebrow', { activity })).toBe(`מסלול · ${act.label}`);
      expect(t('pick.route.stat.duration', { activity })).toBe(`ב${act.label}`);
      expect(t('pick.route.cta', { activity })).toBe(act.cta);
    }
    // HybridStationCard: stationNounLabel / stationActionLabel.
    const DOMAIN_LABEL: Record<string, string> = {
      push: 'דחיפה', pull: 'משיכה', legs: 'רגליים', legs_core: 'רגליים וליבה', core: 'ליבה',
    };
    const nounOld = (at?: string, domainFocus?: string) => {
      if (at === 'stretch' || at === 'mobility' || at === 'yoga') return 'מתיחות';
      if (at === 'core') return 'ליבה';
      return DOMAIN_LABEL[domainFocus ?? ''] ?? 'כוח';
    };
    const actionOld = (at?: string) => {
      if (at === 'stretch' || at === 'mobility' || at === 'yoga') return 'מתיחות ושחרור';
      if (at === 'core') return 'אימון ליבה';
      return 'אימון כוח';
    };
    const kindOf = (at?: string) =>
      (at === 'stretch' || at === 'mobility' || at === 'yoga' ? 'stretch' : at === 'core' ? 'core' : 'strength');
    for (const at of [undefined, 'strength', 'stretch', 'mobility', 'yoga', 'core', 'walk']) {
      for (const domainFocus of [undefined, 'push', 'pull', 'legs', 'legs_core', 'core', 'full_body']) {
        expect(t('hybrid.station.noun', { kind: kindOf(at), domain: domainFocus ?? '' })).toBe(nounOld(at, domainFocus));
      }
      expect(t('hybrid.station.meta', { kind: kindOf(at), time: '10 דק׳' })).toBe(`${actionOld(at)} · ~${'10 דק׳'}`);
    }
  });

  it('key counts per prefix (this batch)', () => {
    const count = (prefix: string) => Object.keys(he).filter((k) => k.startsWith(prefix)).length;
    expect(count('journey.')).toBe(3);
    expect(count('marker.')).toBe(2);
    expect(count('searchBar.')).toBe(1);
    expect(count('legPlan.')).toBe(4);
    expect(count('layers.')).toBe(12);
    expect(count('modes.')).toBe(4);
    expect(count('navBanner.')).toBe(8);
    expect(count('routeCard.')).toBe(2);
    expect(count('carousel.')).toBe(28);
    expect(count('mapSearch.')).toBe(13);
    expect(count('pick.')).toBe(25);
    expect(count('session.')).toBe(1);
    expect(count('hybrid.')).toBe(16);
    expect(count('overview.shell.')).toBe(1);
    expect(count('overview.axis.')).toBe(7);
    expect(count('overview.roundTrip.')).toBe(2);
  });
});

describe('gender batch 1 (21.10.2026) — route card start follows the gender', () => {
  it('male / female / unknown', async () => {
    const { makeT } = await import('../t');
    const { map: mapNs } = await import('@/messages/ns/map');
    const tm = makeT('he', mapNs);
    expect(tm('carousel.card.start', { gender: 'male' })).toBe('התחל אימון');
    expect(tm('carousel.card.start', { gender: 'female' })).toBe('התחילי אימון');
    expect(tm('carousel.card.start', { gender: 'other' })).toBe('יוצאים לאימון');
  });
});
