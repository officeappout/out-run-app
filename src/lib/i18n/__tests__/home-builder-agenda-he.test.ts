/**
 * i18n wave 2 batch y (namespace `home`, prefixes builder.* / agendaCard.* / rollingAgenda.* / dayPreview.* /
 * nearbySpots.*): every key's Hebrew must equal the literal / template the component had before the extraction,
 * copied verbatim — including what a render can't reach (a drag, a save in flight, the auto-applied program note).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/home.json';
import { home } from '@/messages/ns/home';
import { makeT } from '../t';

const t = makeT('he', home);
type Key = keyof typeof he;

const prefixes = ['builder.', 'agendaCard.', 'rollingAgenda.', 'dayPreview.', 'nearbySpots.'];
const countOf = (prefix: string) => Object.keys(he).filter((k) => k.startsWith(prefix)).length;

describe('home — builder / agenda / day preview / nearby spots (batch y)', () => {
  it('key counts per prefix', () => {
    expect(prefixes.map(countOf)).toEqual([66, 19, 6, 7, 11]);
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['builder.back', 'חזור'],
      ['builder.title.schedule', 'תזמן אימון'],
      ['builder.title.build', 'בנה אימון משלך'],
      ['builder.subtitle.schedule', 'בחר תוכנית ושעה לשמירה בלוז'],
      ['builder.subtitle.build', 'מותאם אישית לפי הבחירות שלך'],
      ['builder.gearNudge.aria', 'הגדר ציוד לאימון מותאם'],
      ['builder.gearNudge.title', 'רוצים אימון מותאם ב-100% לציוד שלכם?'],
      ['builder.gearNudge.body', 'לחצו כאן כדי לסמן מה יש לכם בסביבה'],
      ['builder.recommended.title', 'מילאנו עבורכם הגדרות מומלצות'],
      ['builder.recommended.body', 'תוכנית, משך, עצימות ואזורי אימון — אפשר לשנות כל דבר למטה'],
      ['builder.schedule.section', 'שעה'],
      ['builder.schedule.sectionSub', 'מתי?'],
      ['builder.schedule.startTime', 'שעת התחלה'],
      ['builder.location.section', 'מיקום וציוד'],
      ['builder.location.park.label', 'בחוץ'],
      ['builder.location.park.sub', 'פארק / מגרש'],
      ['builder.location.home.label', 'בבית'],
      ['builder.location.home.sub', 'אימון ביתי'],
      ['builder.location.service.label', 'צבא/שירות'],
      ['builder.location.service.sub', 'מוצב / בסיס'],
      ['builder.equipment.byLocation', 'לפי מיקום'],
      ['builder.equipment.editAria', 'ערוך ציוד'],
      ['builder.equipment.edit', 'עריכה'],
      ['builder.duration.section', 'משך זמן'],
      ['builder.duration.minutesUnit', "דק'"],
      ['builder.duration.other', 'אחר'],
      ['builder.duration.sliderMax', '90 דק׳'],
      ['builder.duration.sliderMin', '10 דק׳'],
      ['builder.duration.motivation.15', 'קצר? בטח. עדיף על כלום'],
      ['builder.duration.motivation.30', 'קלאסי. הזמן שעובד לרוב'],
      ['builder.program.section', 'תוכנית'],
      ['builder.program.auto', 'אוטו'],
      ['builder.program.recommended', 'מומלץ'],
      ['builder.muscles.section', 'אזור אימון'],
      ['builder.muscles.sectionSub', '(ריק = כל הגוף)'],
      ['builder.muscles.all', 'כל הגוף (לחץ לסינון)'],
      ['builder.muscles.primary', 'שרירים ראשיים'],
      ['builder.muscles.secondary', 'שרירים משניים'],
      ['builder.muscles.close', 'סגור'],
      ['builder.intensity.section', 'עוצמה'],
      ['builder.intensity.1', 'קליל'],
      ['builder.intensity.2', 'מאוזן'],
      ['builder.intensity.3', 'עצים'],
      ['builder.intensity.blastHint', 'אימון קצר + עצימות גבוהה → בלאסט אוטומטי'],
      ['builder.cta.saving', 'שומר…'],
      ['builder.cta.save', 'שמירה בלו״ז'],
      ['builder.cta.generating', 'מייצר אימון…'],
      ['builder.unlock.title', 'פתיחת תוכנית חדשה'],
      ['builder.unlock.body', 'עדיין לא הערכנו את הרמה שלך באזור הזה. בצע/י מבדק כוח קצר של דקה כדי לפתוח את התוכנית.'],
      ['builder.unlock.cta', 'בצע/י מבדק קצר'],
      ['builder.unlock.later', 'אולי מאוחר יותר'],
      ['agendaCard.title.upperCalisthenics', 'אימון קליסטניקס משולב'],
      ['agendaCard.title.runFallback', 'אימון ריצה'],
      ['agendaCard.swipe.editAria', 'ערוך אימון'],
      ['agendaCard.swipe.edit', 'ערוך'],
      ['agendaCard.swipe.deleteAria', 'מחק אימון'],
      ['agendaCard.swipe.delete', 'מחק'],
      ['agendaCard.communityBadge.generic', 'אימון קהילתי'],
      ['agendaCard.empty', 'אין אימון מתוכנן'],
      ['agendaCard.rest', 'מנוחה'],
      ['agendaCard.restClassic', '🛌 מנוחה'],
      ['agendaCard.addAria', 'הוסף אימון ליום זה'],
      ['agendaCard.add', 'הוסף אימון'],
      ['agendaCard.done', 'הושלם'],
      ['agendaCard.today', 'היום'],
      ['rollingAgenda.header.title', 'יומן אימונים'],
      ['rollingAgenda.week.current', ' · השבוע'],
      ['dayPreview.done', 'בוצע'],
      ['dayPreview.rest.title', 'יום מנוחה'],
      ['dayPreview.rest.subtitle', 'התאוששות ומוביליטי — הגוף בונה את עצמו'],
      ['dayPreview.empty.title', 'אין אימון מתוכנן'],
      ['dayPreview.empty.subtitle', 'אפשר להוסיף אימון מהלו״ז'],
      ['dayPreview.opensOnDay', 'האימון ייפתח ביום עצמו'],
      ['nearbySpots.title.parks', 'גינות כושר קרובות'],
      ['nearbySpots.title.routes', 'מסלולים קרובים'],
      ['nearbySpots.gps.title', 'הפעל גישת מיקום'],
      ['nearbySpots.gps.body.parks', 'כדי למצוא גינות כושר קרובות, נדרשת גישה למיקומך'],
      ['nearbySpots.gps.body.routes', 'כדי למצוא מסלולים קרובים, נדרשת גישה למיקומך'],
      ['nearbySpots.all', 'הכל'],
      ['nearbySpots.route.fallback', 'מסלול'],
    ];
    for (const [key, old] of cases) expect(t(key as never), key).toBe(old);
  });

  it('values (old templates, verbatim)', () => {
    const day = 'חמישי';
    expect(t('builder.schedule.date', { day, date: '22/10' })).toBe(`יום ${day}, ${'22/10'}`);
    expect(t('builder.location.chipAria', { label: 'בחוץ' })).toBe(`מיקום האימון: ${'בחוץ'}`);
    expect(t('builder.duration.custom', { minutes: String(35) })).toBe(`${35} דק׳`);
    expect(t('builder.program.children', { n: String(1234) })).toBe(`${1234} תוכניות`);
    expect(t('builder.program.level', { level: String(12) })).toBe(`רמה ${12}`);
    expect(t('builder.program.includes', { list: 'דחיפה · משיכה' })).toBe(`כולל: ${'דחיפה · משיכה'}`);
    expect(t('builder.muscles.selected', { n: String(1234) })).toBe(`${1234} אזורים נבחרו`);
    expect(t('builder.cta.generate', { minutes: String(45) })).toBe(`צור אימון · ${45} דק׳`);
    // JSX: "יאומן לפי <b>{label}</b> — …שבחרת." + line break + "אפשר לבחור…" → one space.
    expect(t.rich('builder.program.autoApplied', { label: 'קליסטניקס', b: (c: unknown) => `[${String(c)}]` }).join(''))
      .toBe('יאומן לפי [קליסטניקס] — הותאם אוטומטית לשרירים שבחרת. אפשר לבחור תוכנית אחרת למעלה.');
    expect(t('agendaCard.title.skill', { name: 'פלאנץ׳' })).toBe(`אימון ${'פלאנץ׳'}`);
    expect(t('agendaCard.communityBadge.group', { name: 'רצים' })).toBe(`קבוצה: ${'רצים'}`);
    expect(t('rollingAgenda.header.days', { n: String(1234) })).toBe(`${1234} ימים`);
    expect(t('rollingAgenda.week.number', { n: String(1234) })).toBe(`שבוע ${1234}`);
    expect(t('rollingAgenda.move.titleAdd', { day: 'יום שני' })).toBe(`הוסף לאימון ב${'יום שני'}`);
    expect(t('rollingAgenda.move.titleMove', { day: 'שבת' })).toBe(`העברת אימון ל${'שבת'}`);
    expect(t('dayPreview.title', { day, date: '22.10' })).toBe(`מתוכנן ליום ${day} · ${'22.10'}`);
    expect(t('nearbySpots.route.km', { km: (1234.56).toFixed(1) })).toBe(`${(1234.56).toFixed(1)} ק"מ`);
    expect(t('nearbySpots.distance.m', { m: String(Math.round(0.4 * 1000)) })).toBe(`${Math.round(0.4 * 1000)} מ'`);
    expect(t('nearbySpots.distance.km', { km: (2.345).toFixed(1) })).toBe(`${(2.345).toFixed(1)} ק"מ`);
  });

  it('gendered keys (old male / female pick; male written for "other" too)', () => {
    const TIME_MOTIVATION: Record<string, { male: string; female: string }> = {
      15: { male: 'קצר? בטח. עדיף על כלום', female: 'קצר? בטח. עדיף על כלום' },
      30: { male: 'קלאסי. הזמן שעובד לרוב', female: 'קלאסי. הזמן שעובד לרוב' },
      45: { male: 'אימון מספק שתרגיש אותו', female: 'אימון מספק שתרגישי אותו' },
      60: { male: 'למי שאוהב להשקיע בעצמו', female: 'למי שאוהבת להשקיע בעצמה' },
      other: { male: 'תבחר בדיוק מה שמתאים לך', female: 'תבחרי בדיוק מה שמתאים לך' },
    };
    for (const gender of ['male', 'female'] as const) {
      for (const k of Object.keys(TIME_MOTIVATION)) {
        expect(t(`builder.duration.motivation.${k}` as never, { gender })).toBe(TIME_MOTIVATION[k][gender]);
      }
      expect(t('builder.duration.choose', { gender })).toBe(gender === 'female' ? 'תבחרי את הזמן שלך' : 'תבחר את הזמן שלך');
    }
    const generate = { male: 'לא הצלחנו ליצור אימון. נסה שוב.', female: 'לא הצלחנו ליצור אימון. נסי שוב.', other: 'לא הצלחנו ליצור אימון. נסו שוב.' };
    const save = { male: 'שמירה נכשלה. נסה שוב.', female: 'שמירה נכשלה. נסי שוב.', other: 'שמירה נכשלה. נסו שוב.' };
    for (const gender of ['male', 'female', 'other'] as const) {
      expect(t('builder.error.generate', { gender })).toBe(generate[gender]);
      expect(t('builder.error.save', { gender })).toBe(save[gender]);
    }
  });

  it('selects (old switch / map + fallback, re-declared verbatim)', () => {
    const category = (c: string | undefined) => {
      switch (c) {
        case 'cardio': return 'אימון קרדיו';
        case 'walking': return 'הליכה';
        default: return 'אימון כוח';
      }
    };
    for (const c of ['cardio', 'walking', 'strength', 'maintenance', undefined]) {
      expect(t('agendaCard.title.category', { category: c ?? '' })).toBe(category(c));
    }
    const reconstructed = (w: string | undefined) => {
      switch (w) {
        case 'walking': return 'הליכה';
        case 'running':
        case 'cycling': return 'אימון קרדיו';
        case 'hybrid': return 'אימון משולב';
        case 'recovery': return 'אימון התאוששות';
        default: return 'אימון כוח';
      }
    };
    for (const w of ['walking', 'running', 'cycling', 'hybrid', 'recovery', 'strength', undefined]) {
      expect(t('agendaCard.title.reconstructed', { workoutType: w ?? '' })).toBe(reconstructed(w));
    }
    const COMMUNITY: Record<string, string> = {
      walking: 'קבוצת הליכה', running: 'קבוצת ריצה', yoga: 'קבוצת יוגה',
      calisthenics: 'קבוצת קליסטניקס', cycling: 'קבוצת רכיבה', other: 'אימון קבוצתי',
    };
    const community = (cat: string | undefined) => (!cat ? 'אימון קבוצתי' : COMMUNITY[cat] ?? 'אימון קבוצתי');
    for (const c of [...Object.keys(COMMUNITY), 'boxing', '', undefined]) {
      expect(t('agendaCard.title.community', { category: c ?? '' })).toBe(community(c));
    }
    const parkType = (f: string | undefined) => (f === 'gym_park' ? 'גינת כושר' : f === 'court' ? 'מגרש' : 'מתקן');
    for (const f of ['gym_park', 'court', 'other', 'outdoor_gym', undefined]) {
      expect(t('nearbySpots.parkType', { facilityType: f ?? '' })).toBe(parkType(f));
    }
  });
});
