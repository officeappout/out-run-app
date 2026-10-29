/**
 * i18n wave 3B — `common` keys `units.*` / `weekdays.*` against the literals the call sites carried
 * before they moved (copied verbatim, including the geresh ׳ / gershayim ״ and the two ASCII-quote variants).
 */
import { describe, expect, it } from 'vitest';
import { common } from '@/messages/ns/common';
import { makeT } from '@/lib/i18n/t';
import { defaultCommonT, unitLabel, weekdayLabel, weekdayLabels, withUnit } from '@/lib/i18n/units';
import he from '@/messages/he/common.json';

const t = makeT('he', common);

describe('units.* (number + unit)', () => {
  const ns = [0, 1, 2, 10, 999, 1000, 12.34, '12.3', '1:05', '1,234'];
  it.each(ns)('km / m / min / hour / minutes / steps with %s match the old template literals', (n) => {
    expect(withUnit('km', n)).toBe(`${n} ק״מ`);
    expect(withUnit('kmAscii', n)).toBe(`${n} ק"מ`);
    expect(withUnit('m', n)).toBe(`${n} מ׳`);
    expect(withUnit('mAscii', n)).toBe(`${n} מ'`);
    expect(withUnit('min', n)).toBe(`${n} דק׳`);
    expect(withUnit('hour', n)).toBe(`${n} שע׳`);
    expect(withUnit('minutes', n)).toBe(`${n} דקות`);
    expect(withUnit('steps', n)).toBe(`${n} צעדים`);
  });

  it('a count of 1000+ is NOT given a thousands separator (callers pass a string; withUnit stringifies numbers)', () => {
    expect(withUnit('steps', 12345)).toBe('12345 צעדים');
    expect(t('units.steps', { n: '12345' })).toBe('12345 צעדים');
  });

  it('bare labels', () => {
    expect(unitLabel('km')).toBe('ק״מ');
    expect(unitLabel('m')).toBe('מ׳');
    expect(unitLabel('min')).toBe('דק׳');
    expect(unitLabel('hour')).toBe('שע׳');
    expect(unitLabel('minutes')).toBe('דקות');
    expect(unitLabel('hours')).toBe('שעות');
    expect(unitLabel('kmh')).toBe('קמ״ש');
    expect(unitLabel('kg')).toBe('ק״ג');
    expect(unitLabel('minPerKm')).toBe('דק׳ לק״מ');
    expect(unitLabel('steps')).toBe('צעדים');
  });

  it('the exact characters: gershayim U+05F4 in ק״מ, geresh U+05F3 in דק׳', () => {
    expect(unitLabel('km').codePointAt(1)).toBe(0x05f4);
    expect(unitLabel('min').codePointAt(2)).toBe(0x05f3);
    expect(withUnit('km', 5)).toBe('5 ק״מ'); // a single plain space, no nbsp / RTL mark
  });
});

describe('weekdays.*', () => {
  const LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const LETTER = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

  it('long / short / letter equal the old arrays, Sunday first', () => {
    expect(weekdayLabels('long')).toEqual(LONG);
    expect(weekdayLabels('short')).toEqual(SHORT);
    expect(weekdayLabels('letter')).toEqual(LETTER);
    for (let i = 0; i < 7; i++) {
      expect(weekdayLabel(i, 'long')).toBe(LONG[i]);
      expect(weekdayLabel(i, 'short')).toBe(SHORT[i]);
      expect(weekdayLabel(i, 'letter')).toBe(LETTER[i]);
    }
  });

  it('short is letter + geresh', () => {
    for (let i = 0; i < 7; i++) expect(weekdayLabel(i, 'short')).toBe(`${LETTER[i]}׳`);
  });

  it('is not Intl: Intl long has the "יום " prefix', () => {
    expect(new Intl.DateTimeFormat('he-IL', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1, 12)))).toBe('יום ראשון');
    expect(weekdayLabel(0, 'long')).toBe('ראשון');
  });

  it('an index outside 0-6 is an empty string, not a key or "undefined"', () => {
    for (const i of [-1, 7, 1.5, Number.NaN, Infinity]) {
      expect(weekdayLabel(i, 'long')).toBe('');
      expect(weekdayLabel(i, 'short')).toBe('');
      expect(weekdayLabel(i, 'letter')).toBe('');
    }
  });
});

describe('catalog shape', () => {
  it('every units.* / weekdays.* key is Hebrew-only text with no unexpected ICU', () => {
    const keys = Object.keys(he).filter((k) => k.startsWith('units.') || k.startsWith('weekdays.'));
    expect(keys.length).toBe(23 + 21); // 23 units (value + label, incl. sec) + 21 weekdays, 3 x 7 weekdays (part 2 added minAscii + two ASCII labels)
    for (const k of keys) expect((he as Record<string, string>)[k]).not.toMatch(/[<>]/);
  });

  it('other locales fall back to the Hebrew text (their catalogs are still {})', () => {
    for (const loc of ['en', 'ru', 'de'] as const) {
      const tl = makeT(loc, common);
      expect(tl('units.km', { n: '5' })).toBe('5 ק״מ');
      expect(tl('weekdays.long.3')).toBe('רביעי');
    }
  });

  it('the default translator is the Hebrew one', () => {
    expect(defaultCommonT()('units.min', { n: '5' })).toBe('5 דק׳');
  });
});
