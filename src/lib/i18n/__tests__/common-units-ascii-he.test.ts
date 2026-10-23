/**
 * i18n wave 3B part 2 — the three keys added for call sites that wrote the ASCII apostrophe / quote:
 * `units.minAscii` ("דק'"), `units.label.minAscii`, `units.label.kmAscii` ("ק"מ"). Each against the literal it replaces.
 */
import { describe, expect, it } from 'vitest';
import { common } from '@/messages/ns/common';
import { makeT } from '@/lib/i18n/t';
import { unitLabel, withUnit } from '@/lib/i18n/units';

describe('ASCII unit variants (part 2)', () => {
  it.each([0, 1, 2, 10, 999, 1000, '12.3', '1:05'])('units.minAscii with %s is `${n} דק\'` (ASCII apostrophe U+0027)', (n) => {
    expect(withUnit('minAscii', n)).toBe(`${n} דק'`);
    expect(withUnit('minAscii', n).includes('׳')).toBe(false);
  });

  it('labels: דק\' and ק"מ use ASCII punctuation, unlike the geresh / gershayim forms', () => {
    expect(unitLabel('minAscii')).toBe("דק'");
    expect(unitLabel('kmAscii')).toBe('ק"מ');
    expect(`${unitLabel('minAscii')}/${unitLabel('kmAscii')}`).toBe('דק\'/ק"מ'); // RunForecastWidget pace chip
    expect(unitLabel('kmAscii').codePointAt(1)).toBe(0x22);
    expect(unitLabel('minAscii').codePointAt(2)).toBe(0x27);
  });

  it('composed slash forms equal the old literals', () => {
    expect(`${unitLabel('min')}/${unitLabel('km')}`).toBe('דק׳/ק״מ'); // summary rings, RunProgressCircle pace
  });

  it('other locales fall back to Hebrew', () => {
    for (const loc of ['en', 'ru', 'de'] as const) {
      const t = makeT(loc, common);
      expect(t('units.minAscii', { n: '5' })).toBe("5 דק'");
      expect(t('units.label.kmAscii')).toBe('ק"מ');
    }
  });
});
