/**
 * English pilot: flag-off behaviour is byte-identical Hebrew.
 * Registering the three en catalogs must not change what a Hebrew user sees (fallback chain only
 * ever reads the requested locale, then he), and keys outside the pilot still fall back to Hebrew.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import heCommon from '@/messages/he/common.json';
import hePages from '@/messages/he/pages.json';
import heHome from '@/messages/he/home.json';
import enCommon from '@/messages/en/common.json';
import enPages from '@/messages/en/pages.json';
import enHome from '@/messages/en/home.json';
import { common } from '@/messages/ns/common';
import { pages } from '@/messages/ns/pages';
import { home } from '@/messages/ns/home';
import { registerCatalog } from '../catalogs';
import { messageArgNames } from '../core/i18n-core';
import { formatIcu } from '../core/icu';
import { makeT } from '../t';

type Cat = Record<string, string>;
const SETS = [
  { ns: common, he: heCommon as Cat, en: enCommon as Cat },
  { ns: pages, he: hePages as Cat, en: enPages as Cat },
  { ns: home, he: heHome as Cat, en: enHome as Cat },
];
const SELECTS: Record<string, string> = { gender: 'other', tone: 'in', unit: 'km' };
const values = (msg: string) => Object.fromEntries(messageArgNames(msg).map((n) => [n, SELECTS[n] ?? 3]));
const HEBREW = /[֐-׿]/;

describe('en pilot — Hebrew is untouched', () => {
  beforeAll(() => {
    for (const s of SETS) registerCatalog('en', s.ns.name, s.en);
  });

  for (const s of SETS) {
    it(`${s.ns.name}: he t() equals the Hebrew catalog for every key`, () => {
      const t = makeT('he', s.ns);
      for (const [k, msg] of Object.entries(s.he)) {
        expect(t(k as never, values(msg)), k).toBe(formatIcu(msg, 'he', values(msg)));
      }
    });

    it(`${s.ns.name}: every en key formats without throwing and has no Hebrew`, () => {
      for (const [k, msg] of Object.entries(s.en)) {
        const out = formatIcu(msg, 'en', values(s.he[k]));
        expect(HEBREW.test(out), k).toBe(false);
      }
    });

    it(`${s.ns.name}: en locale returns English for pilot keys, Hebrew for the rest`, () => {
      const t = makeT('en', s.ns);
      for (const [k, msg] of Object.entries(s.he)) {
        const v = values(msg);
        if (k in s.en) expect(t(k as never, v), k).toBe(formatIcu(s.en[k], 'en', v));
        else expect(t(k as never, v), k).toBe(formatIcu(msg, 'he', v));
      }
    });
  }

  it('home: only settings.* is translated; hidden military/league keys are not in the pilot at all', () => {
    expect(Object.keys(enHome).every((k) => k.startsWith('settings.'))).toBe(true);
  });
});
