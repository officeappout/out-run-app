/**
 * Namespace `map` (i18n wave 2 — route preview, route overview, equipment
 * sheets: `routePreview.*`, `overview.route.*`, `equipment.*`): every Hebrew
 * key returns exactly what the code rendered before the extraction. The `old`
 * side of each case is the original literal / template expression, copied
 * verbatim from the components (git show origin/main:<file>).
 *
 * The parity snapshots (route-overview-i18n, route-detail-sheet-i18n,
 * equipment-i18n) cover the keys in context; this test also pins the ones
 * those renders can't reach: the overview drawer's "פירוט" body (description,
 * distance chip, "כל פרטי המסלול"), the overlay's workout title bar, the
 * fallback names, every auto cue, every select branch, numbers ≥ 1000.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/map.json';
import { map } from '@/messages/ns/map';
import { makeT } from '../t';

const t = makeT('he', map);
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
      ['overview.route.card.choose', 'בחר את המסלול הזה'],
      ['overview.route.navigate.label', 'ניווט למסלול'],
      ['overview.route.details.toggle', 'פירוט'],
      ['overview.route.details.all', 'כל פרטי המסלול'],
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
      ['routePreview.session.join', 'הצטרף'],
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
      ['routePreview.cta.start', 'התחל אימון'],
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
      ['equipment.sheet.close', 'סגור'],
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

    expect(t('routePreview.distance.km', { km })).toBe(`${km} ק"מ`);
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
      expect(t(`equipment.autoCue.${group}.1` as Key)).toBe(a);
      expect(t(`equipment.autoCue.${group}.2` as Key)).toBe(b);
    }
  });

  it('the three prefixes hold 125 keys (add a case above with every new one)', () => {
    const mine = Object.keys(he).filter((k) => /^(routePreview|overview\.route|equipment)\./.test(k));
    expect(mine.length).toBe(125);
  });
});
