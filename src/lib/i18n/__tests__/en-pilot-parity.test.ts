/**
 * English pilot + batch 3 (player, summary): flag-off behaviour is byte-identical Hebrew.
 * Registering the en catalogs must not change what a Hebrew user sees (fallback chain only
 * ever reads the requested locale, then he), and keys outside the pilot still fall back to Hebrew.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import heCommon from '@/messages/he/common.json';
import hePages from '@/messages/he/pages.json';
import heHome from '@/messages/he/home.json';
import heOnboarding from '@/messages/he/onboarding.json';
import enCommon from '@/messages/en/common.json';
import enPages from '@/messages/en/pages.json';
import enHome from '@/messages/en/home.json';
import enOnboarding from '@/messages/en/onboarding.json';
import { common } from '@/messages/ns/common';
import { pages } from '@/messages/ns/pages';
import { home } from '@/messages/ns/home';
import { onboarding } from '@/messages/ns/onboarding';
import hePlayer from '@/messages/he/player.json';
import heSummary from '@/messages/he/summary.json';
import heProfile from '@/messages/he/profile.json';
import enProfile from '@/messages/en/profile.json';
import { profile } from '@/messages/ns/profile';
import enPlayer from '@/messages/en/player.json';
import enSummary from '@/messages/en/summary.json';
import heMap from '@/messages/he/map.json';
import enMap from '@/messages/en/map.json';
import { map } from '@/messages/ns/map';
import { player } from '@/messages/ns/player';
import { summary } from '@/messages/ns/summary';
import heSocial from '@/messages/he/social.json';
import enSocial from '@/messages/en/social.json';
import { social } from '@/messages/ns/social';
import heTogether from '@/messages/he/together.json';
import enTogether from '@/messages/en/together.json';
import { together } from '@/messages/ns/together';
import heCommunity from '@/messages/he/community.json';
import enCommunity from '@/messages/en/community.json';
import { community } from '@/messages/ns/community';
import { COMMUNITY_HIDDEN } from '../../../../scripts/i18n/validate-en-catalog';
import { registerCatalog } from '../catalogs';
import { messageArgNames } from '../core/i18n-core';
import { formatIcu } from '../core/icu';
import { makeT } from '../t';

type Cat = Record<string, string>;
const SETS = [
  { ns: common, he: heCommon as Cat, en: enCommon as Cat },
  { ns: pages, he: hePages as Cat, en: enPages as Cat },
  { ns: home, he: heHome as Cat, en: enHome as Cat },
  { ns: onboarding, he: heOnboarding as Cat, en: enOnboarding as Cat },
  { ns: player, he: hePlayer as Cat, en: enPlayer as Cat },
  { ns: summary, he: heSummary as Cat, en: enSummary as Cat },
  { ns: profile, he: heProfile as Cat, en: enProfile as Cat },
  { ns: social, he: heSocial as Cat, en: enSocial as Cat },
  { ns: together, he: heTogether as Cat, en: enTogether as Cat },
  { ns: community, he: heCommunity as Cat, en: enCommunity as Cat },
  { ns: map, he: heMap as Cat, en: enMap as Cat },
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

  it('home: every he key is translated in batch 4', () => {
    expect(Object.keys(enHome)).toEqual(Object.keys(heHome));
  });

  it('profile: every he key is translated in batch 4', () => {
    expect(Object.keys(enProfile)).toEqual(Object.keys(heProfile));
  });

  it('social + together: every he key is translated (batch 6)', () => {
    expect(Object.keys(enSocial)).toEqual(Object.keys(heSocial));
    expect(Object.keys(enTogether)).toEqual(Object.keys(heTogether));
  });

  it('community: all keys except the 9 military ones are translated (batch 6)', () => {
    const missing = Object.keys(heCommunity).filter((k) => !(k in enCommunity));
    expect(missing).toHaveLength(9);
    expect(missing.sort()).toEqual(Array.from(COMMUNITY_HIDDEN).sort());
  });

  it('map: every he key is translated in batch 5', () => {
    expect(Object.keys(enMap)).toEqual(Object.keys(heMap));
  });
});
