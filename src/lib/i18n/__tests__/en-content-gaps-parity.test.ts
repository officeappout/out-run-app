/**
 * English content gaps: generated/engine text that was still Hebrew in English.
 * Hebrew output is byte-identical to the literals the code used before (the baseline values below are copied
 * from main); English resolves through the catalogs. Stored values stay Hebrew.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import enCommon from '@/messages/en/common.json';
import enHome from '@/messages/en/home.json';
import enMap from '@/messages/en/map.json';
import { useLocaleStore } from '@/store/useLocaleStore';
import { __resetCatalogsForTests, registerCatalog } from '../catalogs';
import { calmCopy } from '@/lib/calm-return/surface';
import { getMuscleGroupLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { localizeRouteName } from '@/features/parks/core/utils/route-name-display';
import { bikeAdjacentName } from '@/lib/routes-nationwide/bike-adjacent';
import { PLACE_TYPE_LABEL, type GeoPlaceType } from '@/features/parks/core/services/geocode-place-type';
import { placeTypeLabel, searchSourceLabel } from '@/features/parks/core/services/geocode-place-type';
import { setLocalizedCopy } from '@/features/workout-engine/services/workout-metadata.service';
import { weekdayLabel } from '../units';
import { makeT } from '../t';
import { common } from '@/messages/ns/common';
import { map } from '@/messages/ns/map';
import { home } from '@/messages/ns/home';

const BASE_MUSCLES: Record<string, string> = {
  chest: 'חזה', back: 'גב', shoulders: 'כתפיים', abs: 'בטן', obliques: 'אלכסונים', forearms: 'אמה', biceps: 'דו ראשי',
  triceps: 'שלוש ראשי', quads: 'ארבע ראשי', hamstrings: 'מיתר ברך', glutes: 'ישבן', calves: 'שוקיים', traps: 'טרפז',
  cardio: 'קרדיו', full_body: 'כל הגוף', core: 'ליבה', legs: 'רגליים', lats: 'גב רחב', hip_flexors: 'כופפי הירך',
  lower_back: 'גב תחתון', upper_back: 'גב עליון', neck: 'צוואר', adductors: 'מקרבי הירך', abductors: 'מרחיקים', serratus: 'המסור',
};

beforeEach(() => {
  __resetCatalogsForTests();
  registerCatalog('en', 'common', enCommon as Record<string, string>);
  registerCatalog('en', 'home', enHome as Record<string, string>);
  registerCatalog('en', 'map', enMap as Record<string, string>);
});
afterEach(() => useLocaleStore.setState({ locale: 'he', gender: 'other' }));

describe('Hebrew is byte-identical to main', () => {
  it('muscle labels', () => {
    for (const [id, he] of Object.entries(BASE_MUSCLES)) expect(getMuscleGroupLabel(id)).toBe(he);
    expect(getMuscleGroupLabel('unknown_muscle')).toBe('unknown_muscle');
  });
  it('difficulty labels (DifficultyBolts)', () => {
    const t = makeT('he', common);
    expect([1, 2, 3].map((n) => t(`difficulty.label.${n as 1 | 2 | 3}`))).toEqual(['קל', 'בינוני', 'קשה']);
  });
  it('calm return copy, both genders', () => {
    expect(calmCopy('male')).toEqual({
      freshWeekTitle: 'שבוע חדש מתחיל היום',
      freshWeekBody: 'בנינו לך שבוע קליל להתחלה. תמשיך מאיפה שעצרת.',
      levelCheckLink: 'רוצה לבדוק רמה?',
      welcomeBackTitle: 'חוזרים בקטנה',
      welcomeBackSubtitle: 'אימון קליל להיום',
      makeupTitle: 'רוצה להשלים את האימון מאתמול?',
      lightVersionBadge: 'גרסה קלה לחזרה',
      lightVersionCue: 'גרסה קלה לחזרה. בוא נתחיל בנחת.',
      easyRunLabel: 'ריצה קלה',
    });
    expect(calmCopy('female').freshWeekBody).toBe('בנינו לך שבוע קליל להתחלה. תמשיכי מאיפה שעצרת.');
    expect(calmCopy('female').lightVersionCue).toBe('גרסה קלה לחזרה. בואי נתחיל בנחת.');
    expect(calmCopy(null).lightVersionCue).toBe('גרסה קלה לחזרה. בוא נתחיל בנחת.');
  });
  it('weekday letters', () => {
    const t = makeT('he', common);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => weekdayLabel(i, 'letter', t)).join('')).toBe('אבגדהוש');
  });
  it('place type and search row labels', () => {
    for (const k of Object.keys(PLACE_TYPE_LABEL) as GeoPlaceType[]) expect(placeTypeLabel(k)).toBe(PLACE_TYPE_LABEL[k]);
    expect(searchSourceLabel('park')).toBe('פארק');
    expect(searchSourceLabel('route')).toBe('מסלול');
  });
  it('park amenity chips', () => {
    const t = makeT('he', map);
    const base: Record<string, string> = {
      has_benches: 'ספסלים', stairs_training: 'מדרגות', shaded: 'הצללה', night_lighting: 'תאורה', water_fountain: 'ברזיית מים',
      wheelchair_accessible: 'נגישות', has_toilets: 'שירותים', rubber_floor: 'ריצפת גומי', dog_friendly: 'ידידותי לכלבים',
      parkour_friendly: 'פארקור', near_water: 'קרבה למים', safe_zone: 'מיגונית', nearby_shelter: 'מקלט קרוב',
    };
    for (const [id, he] of Object.entries(base)) expect(t(`parkAmenity.${id}` as 'parkAmenity.shaded')).toBe(he);
  });
  it('generated route names pass through untouched', () => {
    for (const n of ['לאורך שדרות רוטשילד · הלוך-חזור', 'לולאת חיפה · 5.2 ק״מ', 'הלוך-חזור מנתניה · נחל אלכסנדר · 8.0 ק״מ', 'פארק הירקון']) {
      expect(localizeRouteName(n, 'he')).toBe(n);
    }
  });
  it('workout copy pair: only the replaced fields are touched', () => {
    const w: { titleLocalized?: { he: string; en: string }; descriptionLocalized?: { he: string; en: string } } = { titleLocalized: { he: 'ת', en: 'T' } };
    setLocalizedCopy(w, { title: null, description: null });
    expect(w.titleLocalized).toEqual({ he: 'ת', en: 'T' });
    setLocalizedCopy(w, { title: 'חדש', description: 'תיאור' });
    expect('titleLocalized' in w).toBe(false);
    setLocalizedCopy(w, { title: 'חדש', description: 'תיאור', titleLocalized: { he: 'חדש', en: 'New' }, descriptionLocalized: { he: 'תיאור', en: 'Desc' } });
    expect(w.titleLocalized?.en).toBe('New');
    expect(w.descriptionLocalized?.en).toBe('Desc');
  });
});

describe('English', () => {
  beforeEach(() => useLocaleStore.setState({ locale: 'en' }));
  it('muscle chips and calm copy', () => {
    expect(getMuscleGroupLabel('triceps')).toBe('Triceps');
    expect(getMuscleGroupLabel('back')).toBe('Back');
    expect(calmCopy('female').welcomeBackSubtitle).toBe('A light workout for today');
    // values saved with a workout stay Hebrew
    expect(calmCopy('female', { source: true }).lightVersionBadge).toBe('גרסה קלה לחזרה');
    expect(calmCopy('female').easyRunLabel).toBe('ריצה קלה');
  });
  it('generated route names: words follow the UI language, street and place names stay', () => {
    expect(localizeRouteName(bikeAdjacentName('שדרות רוטשילד', false), 'en')).toBe('Along שדרות רוטשילד · Out and back');
    expect(localizeRouteName(bikeAdjacentName('שדרות רוטשילד', true), 'en')).toBe('Along שדרות רוטשילד');
    expect(localizeRouteName('לולאת חיפה · קרית שמואל · 5.2 ק״מ', 'en')).toBe('חיפה loop · קרית שמואל · 5.2 km');
    expect(localizeRouteName('הלוך-חזור מנתניה · 8.0 ק״מ', 'en')).toBe('Out and back from נתניה · 8.0 km');
    expect(localizeRouteName('פארק הירקון', 'en')).toBe('פארק הירקון');
  });
  it('place type labels', () => {
    expect(placeTypeLabel('street')).toBe('Street');
    expect(searchSourceLabel('park')).toBe('Park');
  });
  it('weekday letters', () => {
    const t = makeT('en', common);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => weekdayLabel(i, 'letter', t)).join('')).toBe('SMTWTFS');
  });
  it('home catalog has the calm return keys', () => {
    const t = makeT('en', home);
    expect(t('calmReturn.welcomeBack.title')).toBe('Easing back in');
  });
});
