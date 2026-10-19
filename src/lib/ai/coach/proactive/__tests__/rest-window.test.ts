/**
 * The engine's Shabbat / yom tov window must match push.service's (functions) exactly, or
 * the engine would write messages whose push is then dropped for observers.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions', () => ({ logger: { warn: () => {}, info: () => {}, error: () => {} } }));

import { isRestWindow } from '../rest-window';
import { isShabbatOrYomTov } from '../../../../../../functions/src/services/shabbat.service';

const SAMPLES = [
  '2026-10-23T10:59:00Z', // Friday 13:59 IDT
  '2026-10-23T11:00:00Z', // Friday 14:00
  '2026-10-24T17:29:00Z', // Saturday 20:29
  '2026-10-24T17:31:00Z', // Saturday 20:31
  '2026-10-25T09:00:00Z', // Sunday
  '2026-12-25T13:00:00Z', // Friday 15:00 IST
  '2027-04-21T12:30:00Z', // erev Pesach 15:30
  '2027-04-22T10:00:00Z', // Pesach day 1
  '2027-06-10T12:00:00Z', // erev Shavuot
  '2027-10-01T12:00:00Z', // erev Rosh Hashana 5788
  '2027-10-11T08:00:00Z', // Yom Kippur 5788
];

describe('rest window parity with functions/shabbat.service', () => {
  for (const iso of SAMPLES) {
    it(iso, () => {
      const d = new Date(iso);
      expect(isRestWindow(d)).toBe(isShabbatOrYomTov(d));
      expect(isRestWindow(d, false)).toBe(isShabbatOrYomTov(d, false));
    });
  }
  it('known values', () => {
    expect(isRestWindow(new Date('2026-10-23T10:59:00Z'))).toBe(false);
    expect(isRestWindow(new Date('2026-10-23T11:00:00Z'))).toBe(true);
    expect(isRestWindow(new Date('2026-10-24T17:31:00Z'))).toBe(false);
  });
});
