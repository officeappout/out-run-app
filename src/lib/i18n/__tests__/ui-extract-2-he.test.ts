/**
 * i18n extraction batch ui-2: every new Hebrew key returns exactly what the component rendered before the extraction.
 * The `old` side of each case is the original literal / template expression, copied verbatim from the pre-extraction
 * source. The static-markup parity snapshots (recorded from unmodified main) cover most of these in context; this
 * file pins what a static render cannot reach (handlers, branches, big numbers) and the en voice rules.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { map } from '@/messages/ns/map';
import { profile } from '@/messages/ns/profile';
import { player } from '@/messages/ns/player';
import { library } from '@/messages/ns/library';
import { community } from '@/messages/ns/community';
import { common } from '@/messages/ns/common';
import { withUnit } from '../units';
import { makeT } from '../t';

const tMap = makeT('he', map);
const tProfile = makeT('he', profile);
const tPlayer = makeT('he', player);
const tLib = makeT('he', library);
const tCommunity = makeT('he', community);
const tc = makeT('he', common);

describe('map: partner bubbles / turn carousel / slot carousel / overview / AppMap', () => {
  it('plain strings', () => {
    const cases: Array<[Parameters<typeof tMap>[0], string]> = [
      ['partnerBubbles.live.title', 'מי בחוץ'],
      ['partnerBubbles.scheduled.title', 'מי מתכנן'],
      ['turnCarousel.collapsed.label', 'ניווט'],
      ['turnCarousel.minimize.aria', 'מזעור ניווט'],
      ['turnCarousel.minimize.label', 'מזעור'],
      ['turnCarousel.nearlyThere', 'כמעט שם!'],
      ['turnCarousel.nextTurn', 'תפנייה הבאה'],
      ['slotCarousel.toggle.walking', 'הליכה'],
      ['slotCarousel.toggle.running', 'ריצה'],
      ['slotCarousel.toggle.cycling', 'בקרוב'],
      ['slotCarousel.assessment.title', 'עוד לא מילאת שאלון כוח'],
      ['slotCarousel.assessment.body', 'שאלון קצר יתאים לך אישית את אימון הכוח בפארק — לפי הרמה והציוד שיש שם.'],
      ['slotCarousel.assessment.cta', 'למלא שאלון כוח'],
      ['slotCarousel.cta.start', 'יוצאים מיד'],
      ['slotCarousel.cta.view', 'צפה במסלול'],
      ['slotCarousel.recommended', 'מומלץ'],
      ['slotCarousel.close.aria', 'סגור'],
      ['slotCarousel.computing', 'מחשב מסלול…'],
      ['slotCarousel.build', '⚙️ הרכב אימון בעצמי'],
      ['hybridOverview.title.routeStops', 'מסלול + עצירות'],
      ['hybridOverview.title.hybrid', 'אימון משולב'],
      ['hybridOverview.start.label', 'התחל אימון'],
      ['hybridOverview.start.aria', 'התחל אימון משולב'],
      ['hybridOverview.details', 'פירוט'],
      ['hybridOverview.intensity.aria', 'בחירת עצימות'],
      ['hybridOverview.axis.title', 'מהלך האימון'],
      ['appMap.zoomIn', 'הגדל'],
      ['appMap.zoomOut', 'הקטן'],
      ['appMap.stationFallback', 'תחנת כוח'],
      ['appMap.navigateHere', 'נווט לכאן'],
    ];
    for (const [key, old] of cases) expect(tMap(key), key).toBe(old);
  });

  it('values: counts, dots, finish clock, big numbers', () => {
    for (const n of [0, 7, 1234, 2048]) {
      expect(tMap('partnerBubbles.live.aria', { count: String(n) })).toBe(`מי בחוץ — ${n} מתאמנים פעילים`);
      expect(tMap('partnerBubbles.scheduled.aria', { count: String(n) })).toBe(`מי מתכנן — ${n} אימונים מתוכננים`);
    }
    for (const i of [0, 1, 11]) expect(tMap('slotCarousel.dot.aria', { n: String(i + 1) })).toBe(`סלוט ${i + 1}`);
    for (const stations of [0, 1, 4, 12]) expect(tMap('slotCarousel.total.stations', { count: stations })).toBe(`${stations} עצירות`);
    const old = (calories: number) => `<bdi dir="ltr">~${calories}</bdi> קק״ל`;
    for (const calories of [0, 310, 1250]) {
      const parts = tMap.rich<string>('slotCarousel.total.calories', { calories: String(calories), n: ((c: string) => `<bdi dir="ltr">${c}</bdi>`) as never });
      expect(parts.join('')).toBe(old(calories));
    }
    expect(tMap('hybridOverview.meta.finish', { time: '07:05' })).toBe(`מסיים ~${'07:05'}`);
    expect(tMap('hybridOverview.intensity.option', { label: 'קליל', min: '25' })).toBe(`${'קליל'} · ${25}׳`);
  });

  it('hybrid overview: kind, title and route description (every branch of the old code)', () => {
    const aerobicKindLabel = (kind: string | null | undefined) => (kind === 'cycling' ? 'רכיבה' : kind === 'walking' ? 'הליכה' : 'ריצה');
    for (const kind of ['walking', 'running', 'cycling', '', undefined, null]) {
      expect(tMap('hybridOverview.kind', { kind: kind ?? '' })).toBe(aerobicKindLabel(kind));
      expect(tMap('hybridOverview.title.fullPark', { kind: kind ?? '' })).toBe(`אימון מלא בפארק · ${aerobicKindLabel(kind)} + תחנת כוח`);
    }
    const oldDesc = (stationCount: number, distanceKm: number | undefined, cityName?: string) => {
      const stationsLabel = stationCount === 1 ? 'תחנת כוח אחת' : `${stationCount} תחנות כוח`;
      return `מסלול של ${distanceKm != null ? distanceKm.toFixed(1) : '—'} ק״מ עם ${stationsLabel} בדרך${cityName ? `, ב${cityName}` : ''}.`;
    };
    for (const stations of [0, 1, 2, 9]) {
      for (const km of [undefined, 0, 3.456, 12]) {
        for (const city of [undefined, '', 'הרצליה']) {
          expect(
            tMap('hybridOverview.routeDesc', { km: km != null ? km.toFixed(1) : '—', stations, hasCity: city ? 'yes' : 'no', city: city ?? '' }),
            `${stations}/${km}/${city}`,
          ).toBe(oldDesc(stations, km, city));
        }
      }
    }
  });

  it('turn carousel distances: the units the old formatDistance wrote', () => {
    const oldFormat = (meters: number) => {
      if (meters < 100) return `${Math.round(meters)} מ׳`;
      if (meters < 1000) return `${Math.round(meters / 10) * 10} מ׳`;
      return `${(meters / 1000).toFixed(1)} ק"מ`;
    };
    const fmt = (meters: number) => {
      if (meters < 100) return withUnit('m', Math.round(meters), tc);
      if (meters < 1000) return withUnit('m', Math.round(meters / 10) * 10, tc);
      return withUnit('kmAscii', (meters / 1000).toFixed(1), tc);
    };
    for (const m of [0, 4.4, 99, 100, 349, 999, 1000, 12345, 1234567]) expect(fmt(m), String(m)).toBe(oldFormat(m));
  });

  it('participant strip and milestone feed distances', () => {
    expect(tPlayer('together.strip.collective', { distance: withUnit('kmAscii', (2.34).toFixed(1), tc) })).toBe(`יחד עברתם ${withUnit('kmAscii', (2.34).toFixed(1), tc)}`);
    expect(tPlayer('together.strip.collective', { distance: withUnit('kmAscii', (1234.5).toFixed(1), tc) })).toBe('יחד עברתם 1234.5 ק"מ');
    expect(tPlayer('milestone.collective', { distance: withUnit('kmAscii', '3', tc) })).toBe('יחד עברתם 3 ק"מ 💪');
  });
});

describe('profile: saved place sheet and profile page', () => {
  it('saved place sheet (home, work, closed)', () => {
    const LABEL = { home: 'בית', work: 'עבודה' } as const;
    for (const kind of ['home', 'work', ''] as const) {
      const kindLabel = kind ? LABEL[kind] : '';
      expect(tProfile('savedPlace.placeholder', { kind })).toBe(`כתובת ה${kindLabel} שלך...`);
      expect(tProfile('savedPlace.title', { kind })).toBe(`הגדרת ${kindLabel}`);
    }
    expect(tProfile('savedPlace.subtitle')).toBe('חפש כתובת ובחר מהרשימה');
    expect(tProfile('savedPlace.hint.minChars')).toBe('הקלד לפחות 3 תווים');
    expect(tProfile('savedPlace.empty')).toBe('לא נמצאו תוצאות');
    expect(tProfile('savedPlace.close')).toBe('סגור');
  });

  it('profile page strings', () => {
    const cases: Array<[Parameters<typeof tProfile>[0], string]> = [
      ['profilePage.redirecting', 'מעביר להרשמה...'],
      ['profilePage.feedback.toggle', 'שלח משוב / דווח על באג'],
      ['profilePage.feedback.placeholder', 'כתוב כאן את המשוב, הבאג, או הרעיון שלך...'],
      ['profilePage.feedback.sent', 'תודה! המשוב נשלח בהצלחה'],
      ['profilePage.feedback.send', 'שלח לעוזר ה-AI'],
      ['profilePage.feedback.error', 'שגיאה בשליחת המשוב'],
      ['profilePage.edit.name.title', 'עריכת שם'],
      ['profilePage.edit.name.placeholder', 'הזן שם מלא'],
      ['profilePage.edit.dob.title', 'עריכת תאריך לידה'],
      ['profilePage.edit.dob.day', 'יום'],
      ['profilePage.edit.dob.month', 'חודש'],
      ['profilePage.edit.dob.year', 'שנה'],
      ['profilePage.edit.save', 'שמירה'],
      ['profilePage.edit.cancel', 'ביטול'],
      ['profilePage.updated', 'הפרופיל עודכן בהצלחה!'],
    ];
    for (const [key, old] of cases) expect(tProfile(key), key).toBe(old);
    expect(tc('status.loading')).toBe('טוען...');
  });
});

describe('player: lobby, suggestion, metrics drawer, dopamine volume', () => {
  it('plain strings', () => {
    const cases: Array<[Parameters<typeof tPlayer>[0], string]> = [
      ['lobby.share.groupFallback', 'הקבוצה שלי'],
      ['lobby.countdown.starting', 'הקבוצה מתחילה!'],
      ['lobby.go', '🏃 בואו נרוץ!'],
      ['lobby.startRun', 'התחל ריצה'],
      ['lobby.eyebrow', 'לובי'],
      ['lobby.waiting', 'ממתינים להתחלה...'],
      ['lobby.you', '(את/ה)'],
      ['lobby.empty', 'אין משתתפים עדיין'],
      ['lobby.share.cta', 'שלח קישור הצטרפות 🔗'],
      ['lobby.waitingHost', 'ממתינים שהמנהל יתחיל...'],
      ['metricsDrawer.settings.aria', 'הגדרות אימון'],
      ['suggestion.cta.start', 'התחל'],
      ['suggestion.loading', 'טוען…'],
      ['volumeBadge.full', '🏆 Full Volume - קיבלת 100% מהרווח!'],
    ];
    for (const [key, old] of cases) expect(tPlayer(key), key).toBe(old);
  });

  it('values', () => {
    for (const groupName of ['ריצת בוקר', null, undefined])
      expect(tPlayer('lobby.share.text', { group: groupName ?? tPlayer('lobby.share.groupFallback') })).toBe(`הצטרפו לאימון עם ${groupName ?? 'הקבוצה שלי'} ב-Out!`);
    for (const i of [0, 4]) expect(tPlayer('suggestion.dot.aria', { n: String(i + 1) })).toBe(`הצעה ${i + 1}`);
    for (const [done, req] of [[3, 3], [0, 12], [1200, 1500]])
      expect(tPlayer('volumeBadge.progress', { performed: String(done), required: String(req) })).toBe(`ביצעת ${done} מתוך ${req} סטים נדרשים לרמה זו`);
  });
});

describe('library: active workout page and exercise library page', () => {
  it('plain strings', () => {
    const cases: Array<[Parameters<typeof tLib>[0], string]> = [
      ['exerciseLibraryPage.back.aria', 'חזרה'],
      ['exerciseLibraryPage.title', 'ספריית תרגילים'],
      ['exerciseLibraryPage.search.placeholder', 'חפש תרגיל...'],
      ['exerciseLibraryPage.search.clearAria', 'נקה חיפוש'],
      ['activeWorkout.loading.title', 'טוען את האימון...'],
      ['activeWorkout.loading.sub', 'מכין את התרגילים שלך'],
      ['activeWorkout.error.title', 'לא הצלחנו לטעון את האימון'],
      ['activeWorkout.error.home', 'חזרה לדף הבית'],
      ['activeWorkout.close', 'סגור'],
    ];
    for (const [key, old] of cases) expect(tLib(key), key).toBe(old);
  });

  it('load error, per gender (the old pickGendered)', () => {
    const old = { male: 'לא הצלחנו לטעון את האימון. נסה שוב.', female: 'לא הצלחנו לטעון את האימון. נסי שוב.', other: 'לא הצלחנו לטעון את האימון. נסו שוב.' };
    for (const gender of ['male', 'female', 'other'] as const) expect(tLib('activeWorkout.error.load', { gender })).toBe(old[gender]);
  });

  it('XP gain labels', () => {
    for (const n of [1, 12, 100]) {
      expect(tLib('activeWorkout.gain.completion', { pct: String(n) })).toBe(`${n}% על השלמת אימון`);
      expect(tLib('activeWorkout.gain.performance', { pct: String(n) })).toBe(`${n}% על ביצוע מעל המצופה`);
      expect(tLib('activeWorkout.gain.goals', { pct: String(n) })).toBe(`${n}% על השגת יעדים`);
    }
  });

  it('exercise targets: every branch of the old enrichExercise templates', () => {
    const base = { prefix: '', max: '', hasGoal: 'no', goal: '' };
    for (const uni of [false, true]) {
      const perSideSuffix = uni ? ' (לכל צד)' : '';
      const side = uni ? 'yes' : 'no';
      for (const sets of [undefined, 3]) {
        const setsPrefix = sets ? `${sets}×` : '';
        for (const goal of [undefined, 12]) {
          const goalSuffix = goal ? ` (יעד: ${goal})` : '';
          const hasGoal = goal ? 'yes' : 'no';
          const vals = { prefix: setsPrefix, hasGoal, goal: String(goal ?? ''), side };
          // reps range / single
          expect(tLib('activeWorkout.target.range', { ...vals, min: '8', max: '12', unit: 'reps' })).toBe(`${setsPrefix}${8}-${12} חזרות${perSideSuffix}${goalSuffix}`);
          expect(tLib('activeWorkout.target.single', { ...vals, min: '10', max: '10', unit: 'reps' })).toBe(`${setsPrefix}${10} חזרות${perSideSuffix}${goalSuffix}`);
          // seconds (no per-side suffix in the old code)
          const secVals = { ...vals, side: 'no' };
          expect(tLib('activeWorkout.target.range', { ...secVals, min: '30', max: '45', unit: 'seconds' })).toBe(`${setsPrefix}${30}-${45} שניות${goalSuffix}`);
          expect(tLib('activeWorkout.target.single', { ...secVals, min: '40', max: '40', unit: 'seconds' })).toBe(`${setsPrefix}${40} שניות${goalSuffix}`);
        }
      }
      // plain Firestore / segment targets
      expect(tLib('activeWorkout.target.single', { ...base, min: '12', unit: 'reps', side })).toBe(`${12} חזרות${perSideSuffix}`);
    }
    expect(tLib('activeWorkout.target.single', { ...base, min: '60', unit: 'seconds', side: 'no' })).toBe('60 שניות');
  });
});

describe('community: address search', () => {
  it('strings', () => {
    expect(tCommunity('addressSearch.placeholder')).toBe('חפש כתובת, פארק או אתר...');
    expect(tCommunity('addressSearch.empty')).toBe('לא נמצאו תוצאות');
  });
});

describe('English (en) for the new keys', () => {
  const messages = path.resolve(__dirname, '../../../messages');
  const prefixes: Record<string, RegExp> = {
    map: /^(partnerBubbles|turnCarousel|slotCarousel|hybridOverview|appMap)\./,
    profile: /^(savedPlace|profilePage)\./,
    player: /^(lobby|milestone|metricsDrawer|suggestion)\.|^(together\.strip|volumeBadge)\./,
    library: /^(activeWorkout|exerciseLibraryPage)\./,
    community: /^addressSearch\./,
  };
  for (const [ns, re] of Object.entries(prefixes)) {
    it(`${ns}: every new key has an English string, no Hebrew, no long dash, no ASCII apostrophe`, () => {
      const he = JSON.parse(fs.readFileSync(path.join(messages, `he/${ns}.json`), 'utf8')) as Record<string, string>;
      const en = JSON.parse(fs.readFileSync(path.join(messages, `en/${ns}.json`), 'utf8')) as Record<string, string>;
      const keys = Object.keys(he).filter((k) => re.test(k));
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(en[k], k).toBeTypeOf('string');
        expect(/[֐-׿]/.test(en[k]), k).toBe(false);
        expect(en[k].includes('—'), k).toBe(false);
        expect(/[a-z]'[a-z]/i.test(en[k]), k).toBe(false);
      }
    });
  }
});
