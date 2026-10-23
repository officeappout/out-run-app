/**
 * i18n wave 2A, namespace `push`: every key must equal the Hebrew literal the push library had before the
 * extraction. The "old literals" are the catalog snapshot recorded from UNMODIFIED origin/main
 * (src/features/notifications/push-library/__tests__/__snapshots__/push-copy-i18n/catalog.json, commit 1 of the PR),
 * so this cannot drift with the code under test.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import he from '@/messages/he/push.json';
import { push } from '@/messages/ns/push';
import { registerCatalog } from '../catalogs';
import { makeT } from '../t';
import { PUSH_CATALOG, defaultRowsFor, selectPushCopy } from '@/features/notifications/push-library/push-library.core';
import { pushCopyT } from '@/features/notifications/push-library/push-copy-t';
import { pushCopyT as functionsPushCopyT } from '../../../../functions/src/shared/push-copy-t';

const root = path.resolve(__dirname, '../../../..');
const old = JSON.parse(
  readFileSync(path.join(root, 'src/features/notifications/push-library/__tests__/__snapshots__/push-copy-i18n/catalog.json'), 'utf8'),
) as Array<{ pushType: string; defaults: Array<{ title: string; body: string }> }>;

const t = makeT('he', push);

describe('push (he) — every key equals the old literal', () => {
  it('covers every default of every pushType, no more, no fewer', () => {
    const expected: Record<string, string> = {};
    for (const e of old) e.defaults.forEach((d, i) => {
      expected[`${e.pushType}.${i}.title`] = d.title;
      expected[`${e.pushType}.${i}.body`] = d.body;
    });
    expect(Object.keys(he)).toEqual(Object.keys(expected));
    for (const [key, literal] of Object.entries(expected)) expect(t(key as keyof typeof he)).toBe(literal);
  });

  it('the live catalog resolves to the same text', () => {
    expect(PUSH_CATALOG.map((e) => e.pushType)).toEqual(old.map((e) => e.pushType));
    for (const e of PUSH_CATALOG) {
      const o = old.find((x) => x.pushType === e.pushType)!;
      expect(e.defaults.map((d) => [d.title, d.body])).toEqual(o.defaults.map((d) => [d.title, d.body]));
    }
  });

  it('plain copy: the same text for male / female / other / unset gender and any number (no ICU branches to miss)', () => {
    for (const key of Object.keys(he) as Array<keyof typeof he>) {
      for (const gender of ['male', 'female', 'other', undefined, 'whatever']) {
        expect(t(key, { gender })).toBe(he[key]);
      }
      expect(t(key, { count: String(1234), n: 1234 })).toBe(he[key]);
    }
  });

  it('no message contains ICU syntax (copy uses @vars, never braces, quotes or tags)', () => {
    for (const [key, msg] of Object.entries(he)) expect(/[{}'<>]/.test(msg), key).toBe(false);
  });
});

describe('push locale handling', () => {
  afterEach(() => {
    registerCatalog('en', 'push', {});
  });

  it('en / ru / de stubs fall back to the Hebrew text; the default locale is he', () => {
    for (const e of PUSH_CATALOG) {
      const base = defaultRowsFor(e.pushType);
      expect(defaultRowsFor(e.pushType, 'he')).toEqual(base);
      for (const loc of ['en', 'ru', 'de', 'xx']) expect(defaultRowsFor(e.pushType, loc)).toEqual(base);
    }
  });

  it('a translated key is used for its locale only, the rest fall back (ids and every other field unchanged)', () => {
    registerCatalog('en', 'push', { 'streak_rescue.0.title': 'Keep it going' });
    const he0 = defaultRowsFor('streak_rescue');
    const en0 = defaultRowsFor('streak_rescue', 'en');
    expect(en0[0].title).toBe('Keep it going');
    expect(en0[0].body).toBe(he0[0].body);
    expect(en0.map((r) => ({ ...r, title: '', body: '' }))).toEqual(he0.map((r) => ({ ...r, title: '', body: '' })));
    expect(defaultRowsFor('streak_rescue', 'he')[0].title).toBe(he0[0].title);
  });

  it('selectPushCopy takes ctx.locale for the code defaults and defaults to he', () => {
    registerCatalog('en', 'push', { 'level_up.0.title': 'Level up' });
    const ctx = { uid: 'u1', now: new Date('2026-10-15T09:30:00.000Z'), vars: { '@שם': 'דנה', '@רמה': '5', '@תוכנית': 'כוח' } };
    const heOut = selectPushCopy('level_up', [], ctx);
    expect(heOut).toEqual(selectPushCopy('level_up', [], { ...ctx, locale: 'he' }));
    expect(heOut).toEqual(selectPushCopy('level_up', [], { ...ctx, locale: 'ru' }));
    const enOut = selectPushCopy('level_up', [], { ...ctx, locale: 'en' });
    expect(enOut?.rowId).toBe(heOut?.rowId);
  });

  it('the app and the functions translator return the same text for every key and locale', () => {
    for (const loc of ['he', 'en', 'ru', 'de', 'bad']) {
      const a = pushCopyT(loc);
      const f = functionsPushCopyT(loc);
      for (const key of Object.keys(he)) expect(f(key), `${loc} ${key}`).toBe(a(key));
    }
    expect(pushCopyT()('first_week.0.title')).toBe(he['first_week.0.title' as keyof typeof he]);
    expect(functionsPushCopyT()('nope.9.title')).toBe('nope.9.title');
  });
});
