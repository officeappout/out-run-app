/**
 * Namespace `map` (i18n wave 2 — Partner Finder, `partners.*`; route preview /
 * route overview / equipment sheets, `routePreview.*` / `overview.route.*` /
 * `equipment.*` — second describe below): every Hebrew
 * key returns exactly what the code rendered before the extraction. The `old`
 * side of each case is the original literal / template expression, copied
 * verbatim from src/features/partners/components.
 *
 * The static-markup parity snapshots (partners-i18n-parity.test.tsx) cover the
 * keys in context; this test also pins the ones a static render can't reach
 * (the "connecting…" CTA, the auto-switch hint) and every gender branch.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/map.json';
import { map } from '@/messages/ns/map';
import { makeT } from '../t';

const t = makeT('he', map);

// The old g(gender, male, female) helper: female → feminine, anything else → masculine.
const g = (gender: string | undefined, male: string, female: string) => (gender === 'female' ? female : male);

describe('map (he) — byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['partners.activity.strength', 'כוח'],
      ['partners.activity.running', 'ריצה'],
      ['partners.activity.walking', 'הליכה'],
      ['partners.activity.cycling', 'רכיבה'],
      ['partners.card.live', 'לייב'],
      ['partners.card.ownArrival', 'הגעה שלי'],
      ['partners.card.join', 'הצטרפות'],
      ['partners.card.connecting', 'מתחבר...'],
      ['partners.card.openChat', "פתיחת צ'אט"],
      ['partners.empty.live.title', 'אין מתאמנים פעילים קרוב אליך עכשיו'],
      ['partners.empty.scheduled.title', 'אין אימונים מתוכננים באזור'],
      ['partners.empty.changeFilter', 'שינוי סינון'],
      ['partners.radar.live', 'מחפש מתאמנים קרוב אליך...'],
      ['partners.radar.scheduled', 'מחפש אימונים מתוכננים...'],
      ['partners.overlay.back', 'חזרה'],
      ['partners.overlay.tab.live', 'מי בחוץ'],
      ['partners.overlay.tab.scheduled', 'מי מתכנן'],
      ['partners.overlay.live.title', 'מי מתאמן עכשיו?'],
      ['partners.overlay.live.subtitle', 'מתאמנים פעילים קרוב אליך כרגע'],
      ['partners.overlay.scheduled.title', 'מי מתכנן להתאמן?'],
      ['partners.overlay.scheduled.subtitle', 'אימונים מתוכננים היום ומחר באזורך'],
      ['partners.overlay.autoSwitchHint', 'מציג קבוצות מתוכננות'],
      ['partners.overlay.loading', 'מחפש שותפים...'],
      ['partners.filter.activity.all', 'הכל'],
      ['partners.filter.activity.strength', 'כוח'],
      ['partners.filter.activity.running', 'ריצה'],
      ['partners.filter.activity.walking', 'הליכה'],
      ['partners.filter.soloGroup.all', 'הכל'],
      ['partners.filter.soloGroup.solo', 'יחידים'],
      ['partners.filter.soloGroup.groups', 'קבוצות'],
      ['partners.filter.time.all', 'הכל'],
      ['partners.filter.time.today', 'היום'],
      ['partners.filter.time.tomorrow', 'מחר'],
      ['partners.filter.open', 'סינון'],
      ['partners.filter.type', 'סוג'],
      ['partners.filter.when', 'מתי'],
      ['partners.filter.timeRange', 'טווח שעות'],
      ['partners.filter.timeStart', 'שעת התחלה'],
      ['partners.filter.timeEnd', 'שעת סיום'],
      ['partners.filter.program', 'תוכנית'],
      ['partners.filter.program.all', 'הכל'],
      ['partners.filter.level', 'רמה'],
      ['partners.filter.levelMin', 'רמה מינימום'],
      ['partners.filter.levelMax', 'רמה מקסימום'],
      ['partners.filter.level.beginner', 'מתחיל'],
      ['partners.filter.level.advanced', 'מתקדם'],
      ['partners.filter.runDistance', 'מרחק יעד'],
      ['partners.filter.runDistanceLabel', 'מרחק יעד בקילומטרים'],
      ['partners.filter.pace', 'קצב (דקות לק״מ)'],
      ['partners.filter.paceMin', 'קצב מינימום'],
      ['partners.filter.paceMax', 'קצב מקסימום'],
      ['partners.filter.pace.slow', 'איטי'],
      ['partners.filter.pace.fast', 'מהיר'],
      ['partners.sheet.title', 'סינון'],
      ['partners.sheet.reset', 'איפוס'],
      ['partners.sheet.close', 'סגירה'],
      ['partners.sheet.apply', 'החל'],
      ['partners.sheet.distance', 'מרחק'],
      ['partners.sheet.distanceLabel', 'מרחק חיפוש בקילומטרים'],
      ['partners.sheet.gender', 'מגדר'],
      ['partners.sheet.gender.all', 'הכל'],
      ['partners.sheet.gender.male', 'גברים'],
      ['partners.sheet.gender.female', 'נשים'],
      ['partners.sheet.age', 'טווח גילאים'],
      ['partners.sheet.ageMin', 'גיל מינימום'],
      ['partners.sheet.ageMax', 'גיל מקסימום'],
      ['partners.sheet.age.young', 'צעיר'],
      ['partners.sheet.age.old', 'מבוגר'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('values', () => {
    for (const km of [0.05, 0.42, 3.456, 12.7]) {
      const old = km < 1 ? `${Math.round(km * 1000)} מ׳` : `${km.toFixed(km < 10 ? 1 : 0)} ק״מ`;
      const now = km < 1
        ? t('partners.distance.meters', { m: Math.round(km * 1000) })
        : t('partners.distance.km', { km: km.toFixed(km < 10 ? 1 : 0) });
      expect(now).toBe(old);
    }
    // PartnerFilterSheet's formatDistance (no toFixed) and the run-distance chip.
    for (const v of [0.5, 5, 7.5, 15]) {
      const old = v < 1 ? `${Math.round(v * 1000)} מ׳` : `${v} ק״מ`;
      const now = v < 1 ? t('partners.distance.meters', { m: Math.round(v * 1000) }) : t('partners.distance.km', { km: v });
      expect(now).toBe(old);
      expect(t('partners.sheet.distanceUpTo', { distance: now })).toBe(`עד ${old}`);
    }
    const mockPace = '5:30', n = 'פלג גוף עליון', programLevel = 5, name = 'נועה', memberCount = 7, currentStreak = 12;
    expect(t('partners.activity.runningPace', { pace: mockPace })).toBe(`ריצה · ${mockPace} לק״מ`);
    expect(t('partners.activity.walkingPace', { pace: mockPace })).toBe(`הליכה · ${mockPace} לק״מ`);
    expect(t('partners.card.programLevel', { program: n, level: programLevel })).toBe(`${n} · רמה ${programLevel}`);
    expect(t('partners.card.openProfile', { name })).toBe(`פתח פרופיל של ${name}`);
    expect(t('partners.card.members', { count: memberCount })).toBe(`${memberCount} משתתפים`);
    expect(t('partners.card.streak', { days: currentStreak })).toBe(`${currentStreak} ימים רצף`);
    const extraCount = 3;
    expect(t('partners.filter.openActive', { count: extraCount })).toBe(`סינון — ${extraCount} פעילים`);
  });

  it('gendered empty-state copy (old g() helper: female, else masculine)', () => {
    for (const gender of ['male', 'female', 'other'] as const) {
      // Gender batch 2 (21.10.2026): other = neutral (was the masculine text).
      expect(t('partners.empty.live.sub', { gender })).toBe(
        gender === 'other'
          ? 'היו הראשונים — סמנו שאתם פנויים לפני האימון'
          : `${g(gender, 'היה הראשון', 'היי הראשונה')} — ${g(gender, 'סמן את עצמך פנוי', 'סמני את עצמך פנויה')} לפני האימון`,
      );
      expect(t('partners.empty.scheduled.sub', { gender })).toBe(
        // Owner copy fix (21.10.2026): the female form had a masculine second verb ("ושתף").
        gender === 'other'
          ? 'הוסיפו אימון ללוז ושתפו אותו עם הקהילה'
          : g(gender, 'הוסף אימון ללוז ושתף אותו עם הקהילה', 'הוסיפי אימון ללוז ושתפי אותו עם הקהילה'),
      );
    }
  });

  it('no key is left untested', () => {
    // Keep this list in step with the catalog: a new partners.* key needs a case above.
    // (Other areas of the namespace count their own prefixes in their own describe.)
    expect(Object.keys(he).filter((k) => k.startsWith('partners.')).length).toBe(80);
  });
});

// ── Route preview / route overview / equipment sheets ─────────────────────
// Parity snapshots: route-overview-i18n, route-detail-sheet-i18n, equipment-i18n.
// Pinned here as well: the overview drawer's "פירוט" body (description, distance
// chip, "כל פרטי המסלול"), the overlay's workout title bar, the fallback names,
// every auto cue, every select branch, numbers ≥ 1000.
type Key = keyof typeof he;

describe('map (he) — route preview / overview / equipment, byte-identical', () => {
  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['overview.route.nameFallback', 'מסלול'],
      ['overview.route.leg.walkThere', 'הליכה אל המסלול'],
      ['overview.route.leg.walkBack', 'הליכה חזרה'],
      ['overview.route.chip.lit', 'מואר'],
      ['overview.route.along.title', 'לאורך המסלול · ק״מ מההתחלה'],
      ['overview.route.along.start', 'התחלה'],
      ['overview.route.along.drinkingWater', 'ברזייה'],
      ['overview.route.along.bench', 'ספסלים'],
      ['overview.route.along.fitnessStation', 'מתקני כושר'],
      ['overview.route.along.court', 'מגרש ספורט'],
      ['overview.route.along.dogPark', 'גינת כלבים'],
      ['overview.route.card.nameFallback', 'סיבוב מעגלי'],
      ['overview.route.card.choose', 'בוחרים את המסלול הזה'],
      ['overview.route.navigate.label', 'ניווט למסלול'],
      ['overview.route.details.toggle', 'פירוט'],
      ['overview.route.details.all', 'כל פרטי המסלול'],
      ['overview.route.credits.label', 'קרדיט לנתונים'], // enable_map_polish_v1 (new copy)
      ['overview.route.activityPicker.label', 'בחירת פעילות'],
      ['overview.route.course.title', 'מהלך המסלול'],
      ['overview.route.titleBar.route', 'מבט על מסלול'],
      ['overview.route.titleBar.workout', 'מבט על אימון'],
      ['overview.route.elevation.title', 'פרופיל גובה'],
      ['routePreview.nameFallback', 'מסלול'],
      ['routePreview.title.unnamed', 'מסלול ללא שם'],
      ['routePreview.stat.length', 'אורך מסלול'],
      ['routePreview.community.title', 'מתאמנים'],
      ['routePreview.community.empty', 'אף אחד עוד לא פרסם שהוא מגיע...'],
      ['routePreview.community.arrive', 'אני מגיע ב...'],
      ['routePreview.community.arrivalTime', 'שעת הגעה'],
      ['routePreview.community.arrivalEarliest', 'שעת הגעה מוקדמת'],
      ['routePreview.community.arrivalLatest', 'שעת הגעה מאוחרת'],
      ['routePreview.community.publish', 'פרסם'],
      ['routePreview.community.me', 'אני'],
      ['routePreview.community.userFallback', 'משתמש'],
      ['routePreview.session.group', 'קבוצתי'],
      ['routePreview.session.joined', 'נרשמת'],
      ['routePreview.session.join', 'הצטרפות'],
      ['routePreview.walk.title', 'הליכה למסלול'],
      ['routePreview.walk.arrived', 'הגעת למסלול'],
      ['routePreview.walk.calculating', 'מחשב הוראות...'],
      ['routePreview.accordion.routeFallback', 'המסלול'],
      ['routePreview.feature.lit', 'מואר'],
      ['routePreview.stop.fallback', 'גינת כושר'],
      ['routePreview.finish', 'סיום המסלול'],
      ['routePreview.features.title', 'תכונות ומתקנים'],
      ['routePreview.dev.title', 'Dev: סימולציה'],
      ['routePreview.dev.stop', 'עצור'],
      ['routePreview.dev.simulateWalk', 'דמה הליכה'],
      ['routePreview.cta.start', 'יוצאים לאימון'],
      ['routePreview.navigate.title', 'ניווט'],
      ['equipment.videoAvailable', 'סרטון זמין'],
      ['equipment.error.notFound', 'המתקן לא נמצא'],
      ['equipment.error.loadFailed', 'אירעה שגיאה בטעינת המתקן'],
      ['equipment.functional', 'ציוד פונקציונלי'],
      ['equipment.section.primaryMuscle', 'שריר ראשי'],
      ['equipment.section.secondaryMuscles', 'שרירים משניים'],
      ['equipment.section.programs', 'תוכניות מוקצות'],
      ['equipment.section.cues', 'דגשים'],
      ['equipment.section.tips', 'טיפים'],
      ['equipment.section.description', 'תיאור'],
      ['equipment.section.brands', 'מותגים זמינים'],
      ['equipment.sheet.label', 'פרטי מתקן'],
      ['equipment.sheet.close', 'סגירה'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('activity selects (old ACTIVITY_LABEL maps / ternaries)', () => {
    const ACTIVITY_LABEL: Record<string, string> = { walking: 'הליכה', running: 'ריצה', cycling: 'רכיבה' };
    for (const activity of ['walking', 'running', 'cycling']) {
      const label = ACTIVITY_LABEL[activity];
      expect(t('overview.route.activity', { activity })).toBe(label);
      expect(t('overview.route.cta.start', { activity })).toBe(`התחל ${label}`);
      expect(t('overview.route.activityOption', { activity, min: String(1250) })).toBe(`${label} · ${1250}׳`);
      expect(t('overview.route.leg.title', { activity, name: 'לולאה' })).toBe(`${label} · ${'לולאה'}`);
      const act = activity;
      expect(t('routePreview.navActivity', { activity })).toBe(act === 'walking' ? 'הליכה' : act === 'running' ? 'ריצה' : 'רכיבה');
    }
    const ACTIVITY_LABELS: Record<string, string> = { running: 'ריצה', walking: 'הליכה', cycling: 'רכיבה', workout: 'אימון' };
    for (const activity of ['running', 'walking', 'cycling', 'workout', 'swimming', '']) {
      expect(t('routePreview.activity', { activity })).toBe(ACTIVITY_LABELS[activity] || '');
    }
  });

  it('surface / environment / day filter (label map + raw fallback)', () => {
    const SURFACE_LABELS: Record<string, string> = { paved: 'סלול', road: 'סלול', asphalt: 'סלול', trail: 'שבילים', dirt: 'שבילים', mixed: 'מעורב' };
    for (const surface of ['paved', 'road', 'asphalt', 'trail', 'dirt', 'mixed', 'gravel']) {
      expect(t('routePreview.surface', { surface })).toBe(SURFACE_LABELS[surface] ?? surface);
    }
    const ENVIRONMENT_LABELS: Record<string, string> = { urban: 'עירוני', nature: 'טבע', park: 'פארק', beach: 'חוף' };
    for (const environment of ['urban', 'nature', 'park', 'beach', 'desert']) {
      expect(t('routePreview.environment', { environment })).toBe(ENVIRONMENT_LABELS[environment] ?? environment);
    }
    const DAY_FILTER_LABELS: Record<string, string> = { today: 'היום', tomorrow: 'מחר', week: 'השבוע' };
    for (const filter of ['today', 'tomorrow', 'week']) expect(t('routePreview.dayFilter', { filter })).toBe(DAY_FILTER_LABELS[filter]);
  });

  it('templates with values (numbers ≥ 1000 passed as strings — no separators)', () => {
    const km = '4.2', m = 1234, min = 1100, h = 2;
    expect(t('overview.route.meta.km', { km })).toBe(`${km} ק״מ`);
    expect(t('overview.route.meta.min', { min: String(min) })).toBe(`${min} דק׳`);
    expect(t('overview.route.meta.finish', { time: '09:13' })).toBe(`מסיים ~${'09:13'}`);
    expect(t('overview.route.chip.litPct', { pct: String(83) })).toBe(`מואר ${83}%`);
    expect(t('overview.route.chip.dedicated', { pct: String(72) })).toBe(`שביל ייעודי ${72}%`);
    expect(t('overview.route.chip.ascent', { m: String(m) })).toBe(`${m} מ׳ עלייה`);
    const city = 'תל אביב';
    expect(t('overview.route.descriptionInCity', { km, city })).toBe(`מסלול של ${km} ק״מ${city ? `, ב${city}` : ''}.`);
    const noCity = '' as string;
    expect(t('overview.route.description', { km })).toBe(`מסלול של ${km} ק״מ${noCity ? `, ב${noCity}` : ''}.`);
    expect(t('overview.route.elevation.peakClimb', { max: String(m), from: '0.1', to: '0.3' })).toBe(`שיא ${m} מ׳ · ק״מ ${'0.1'}–${'0.3'}`);
    expect(t('overview.route.elevation.peak', { max: String(m) })).toBe(`שיא ${m} מ׳`);

    expect(t('routePreview.distance.km', { km })).toBe(`${km} ק״מ`);
    expect(t('routePreview.distance.m', { m: String(600) })).toBe(`${600} מ'`);
    expect(t('routePreview.distance.mCompact', { m: String(999) })).toBe(`${999}מ'`);
    expect(t('routePreview.duration.hoursMinutes', { h: String(h), m: String(15) })).toBe(`${h} שעה ${15} דק'`);
    expect(t('routePreview.duration.hours', { h: String(h) })).toBe(`${h} שעה`);
    expect(t('routePreview.duration.minutes', { min: String(min) })).toBe(`${min} דק'`);
    expect(t('routePreview.distToStart', { distance: '50 מטר ממך' })).toBe(`${'50 מטר ממך'} עד תחילת המסלול`);
    expect(t('routePreview.stat.calories', { calories: String(1250) })).toBe(`${1250} קק"ל`);
    expect(t('routePreview.stat.usage', { count: String(1500) })).toBe(`${1500} שימושים`);
    expect(t('routePreview.session.tomorrowAt', { time: '07:05' })).toBe(`מחר ${'07:05'}`);

    expect(t('equipment.videoTitle', { name: 'מתח' })).toBe(`${'מתח'} demo video`);
    expect(t('equipment.programChip', { label: 'פלג גוף עליון', level: String(3) })).toBe(`${'פלג גוף עליון'} · Level ${3}`);
    expect(t('equipment.brandFallback', { n: String(2) })).toBe(`מותג ${1 + 1}`);
    // rich: "מותג:" + {' '} + <span>{brandName}</span>
    expect(t.rich<string>('equipment.brandLine', { name: 'Ludos', brand: (c: unknown) => `<span>${String(c)}</span>` }).join(''))
      .toBe('מותג: <span>Ludos</span>');
  });

  it('auto cues — every muscle group and the generic fallback', () => {
    const AUTO_CUES_BY_MUSCLE: Record<string, string[]> = {
      chest: ['שמור על שכמות סגורות לאורך כל התנועה', 'הורד את הגוף בקצב מבוקר ועלה במלוא הטווח'],
      back: ['התחל את המשיכה משכמות, לא ממרפקים', 'שמור על ליבה אסופה — אל תקשת את הגב התחתון'],
      shoulders: ['ייצב את שרירי הליבה לפני כל חזרה', 'אל תיכנס לטווח כואב — עצור איפה שזה מרגיש בשליטה'],
      biceps: ['הצמד את המרפקים לגוף — אל תפתח אותם החוצה', 'נשוף בעת המשיכה, שאף בירידה'],
      triceps: ['שמור על המרפקים קרוב לגוף לאורך כל התנועה', 'נצל את מלוא הטווח — יישור מלא בקצה החזרה'],
      abs: ['שמור על נשימה רציפה — אל תעצור את האוויר', 'רכז את הכיווץ בבטן, לא בכתפיים'],
      core: ['שמור על נשימה רציפה — אל תעצור את האוויר', 'רכז את הכיווץ בבטן, לא בכתפיים'],
      obliques: ['התנועה מגיעה מהמותן, לא מהזרועות', 'שמור על אגן יציב — תוריד את הקצב לטובת איכות'],
      quads: ['הברכיים בקו אחד עם האצבעות — לא נכנסות פנימה', 'הורד עד 90° לפחות, שמור על משקל באמצע כף הרגל'],
      hamstrings: ['תהליך אקצנטרי איטי — 3 שניות בירידה', 'שמור על גב ניטרלי, אגן נעול'],
      glutes: ['דחוף דרך העקבים, לא דרך אצבעות', 'נעל את האגן בנקודת השיא — סחיטה מלאה'],
      calves: ['עלייה איטית, מתיחה מלאה למטה', 'אל תקפיץ — תאים בכל חזרה'],
      fullBody: ['התחל בקצב מבוקר עד שאתה מרגיש את הטכניקה', 'נשוף במאמץ, שאף בשלב הקל'],
      legs: ['שמור על משקל באמצע כף הרגל לאורך כל החזרה', 'אל תקרוס פנימה בברכיים — דחוף החוצה במכוון'],
      generic: ['שמור על תנועה מבוקרת — אין צורך להאיץ', 'רכז כל חזרה בשריר היעד, לא בתאוצה'],
    };
    for (const [group, [a, b]] of Object.entries(AUTO_CUES_BY_MUSCLE)) {
      // male keeps the old cue; female / unknown since gender batch 3 (gender-batch3-catalogs.test.ts)
      expect(t(`equipment.autoCue.${group}.1` as Key, { gender: 'male' })).toBe(a);
      expect(t(`equipment.autoCue.${group}.2` as Key, { gender: 'male' })).toBe(b);
    }
  });

  it('the three prefixes hold 126 keys (add a case above with every new one)', () => {
    const mine = Object.keys(he).filter((k) => /^(routePreview|overview\.route|equipment)\./.test(k));
    expect(mine.length).toBe(126);
  });
});
