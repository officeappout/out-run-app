/**
 * i18n wave 2 batch az: Hebrew keys return exactly the literals the code had before the extraction
 * (copied verbatim from origin/main): library `exercises.equipSheet.*` (EquipmentFilterSheet / Shell),
 * map `weather.chip.*` (WeatherChip), legal `help.chapter.<id>.*` (src/lib/app-help/chapters.ts).
 */
import { describe, expect, it } from 'vitest';
import heLibrary from '@/messages/he/library.json';
import heMap from '@/messages/he/map.json';
import heLegal from '@/messages/he/legal.json';
import { library } from '@/messages/ns/library';
import { map } from '@/messages/ns/map';
import { legal } from '@/messages/ns/legal';
import { HELP_CHAPTERS } from '@/lib/app-help/chapters';
import { tutorialToolResult } from '@/lib/ai/coach/round4/tutorial';
import { makeT } from '../t';

describe('library: equipment sheet', () => {
  const t = makeT('he', library);
  it('plain strings', () => {
    const cases: Array<[keyof typeof heLibrary, string]> = [
      ['exercises.equipSheet.title.profile', 'הציוד שלי'],
      ['exercises.equipSheet.title.filter', 'ציוד ומיקום'],
      ['exercises.equipSheet.close', 'סגור'],
      ['exercises.equipSheet.location', 'מקום אימון'],
      ['exercises.equipSheet.preset.home', 'בית'],
      ['exercises.equipSheet.preset.park', 'פארק'],
      ['exercises.equipSheet.base', 'בסיס'],
      ['exercises.equipSheet.loadError', 'שגיאה בטעינת הציוד'],
      ['exercises.equipSheet.clear', 'נקה'],
      ['exercises.equipSheet.saving', 'שומר...'],
      ['exercises.equipSheet.save', 'שמור שינויים'],
      ['exercises.equipSheet.inlineApply', 'בואו נעדכן ציוד'],
      ['exercises.equipSheet.apply', 'החל סינון'],
      ['exercises.equipSheet.summary.none', 'לא נבחר ציוד — יוצגו כל התרגילים'],
      ['exercises.equipSheet.summary.home', 'ערכת בית · גוף + מאולתר'],
      ['exercises.equipSheet.summary.park', 'ערכת פארק · גוף + ציוד פארק'],
      ['exercises.equipSheet.summary.gym', 'ערכת חדר כושר · כל הציוד'],
      ['exercises.equipSheet.summary.bodyweightOnly', 'משקל גוף בלבד'],
      // reused existing keys the sheet now renders
      ['exercises.filters.bodyweight', 'משקל גוף'],
      ['exercises.filters.gearLoading', 'טוען ציוד...'],
      ['exercises.filters.gearPark', 'ציוד פארק'],
      ['exercises.filters.gearImprovised', 'ציוד מאולתר / ביתי'],
      ['exercises.filters.gearPersonal', 'ציוד אישי'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });
  it('count', () => {
    for (const n of [1, 2, 14, 1234]) expect(t('exercises.equipSheet.summary.count', { count: String(n) })).toBe(`${n} פריטי ציוד נבחרו`);
  });
});

describe('map: weather chip', () => {
  const t = makeT('he', map);
  it('aria-label with and without hint', () => {
    for (const temp of [-3, 0, 24]) {
      expect(t('weather.chip.aria', { temp: String(temp) })).toBe(`מזג האוויר: ${temp} מעלות`);
      expect(t('weather.chip.ariaHint', { temp: String(temp), hint: 'גשם בקרוב' })).toBe(`מזג האוויר: ${temp} מעלות, גשם בקרוב`);
    }
  });
  it('catalog has no stray weather keys', () => {
    expect(Object.keys(heMap).filter((k) => k.startsWith('weather.')).length).toBe(2);
  });
});

describe('legal: help chapters', () => {
  const t = makeT('he', legal);
  const OLD: Record<string, [string, string]> = {
    map: ['מפה ופארקים', 'חיפוש פארק, שכבות המפה ומה רואים בפארק'],
    workouts: ['אימונים', 'האימון של היום, בניית אימון לבד ומיקום האימון'],
    schedule: ['בונה הלו״ז', 'הלו״ז השבועי, הזזת אימון ובניית שבוע'],
    running: ['ריצה והליכה', 'ריצה והליכה חופשית, מסלולים ותוכנית ריצה'],
    kelly: ['קלי', 'מה קלי יודע לעשות ואיך מדברים עם הצוות'],
    settings: ['הגדרות', 'התראות, צעדים, ציוד, חשבון ופרטיות'],
  };
  it('every chapter title / blurb', () => {
    expect(HELP_CHAPTERS.map((c) => c.id).sort()).toEqual(Object.keys(OLD).sort());
    for (const c of HELP_CHAPTERS) {
      expect(t(`help.chapter.${c.id}.title`)).toBe(OLD[c.id][0]);
      expect(t(`help.chapter.${c.id}.blurb`)).toBe(OLD[c.id][1]);
    }
    expect(Object.keys(heLegal).filter((k) => /^help\.chapter\.\w+\.(title|blurb)$/.test(k)).length).toBe(12);
  });
  it("Kelly's start_tutorial result keeps the Hebrew chapter title", () => {
    for (const [id, [title]] of Object.entries(OLD)) {
      const r = tutorialToolResult({ topic: id } as never, 'male') as { title: string };
      expect(r.title).toBe(title);
    }
  });
});
