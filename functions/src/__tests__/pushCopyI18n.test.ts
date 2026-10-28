/**
 * i18n wave 2A: the push library's code defaults resolve through the functions-side translator
 * (shared/push-copy-t.ts → i18n-t → mirrored `push` catalog). Hebrew is unchanged; another locale
 * falls back to it until wave 5B ships translations. The clock is pinned (the rotation key is the Israel date).
 */
import { describe, expect, it } from 'vitest';
import { PUSH_CATALOG, defaultRowsFor, selectPushCopy } from '../shared/push-library.core';
import { FUNCTIONS_CATALOGS } from '../shared/i18n-catalogs';
import { pushCopyT } from '../shared/push-copy-t';

const NOW = new Date('2026-10-15T09:30:00.000Z');

describe('push copy through the functions translator', () => {
  it('every default title/body is the catalog text for its <pushType>.<index> key', () => {
    const t = pushCopyT('he');
    for (const e of PUSH_CATALOG) {
      e.defaults.forEach((d, i) => {
        expect(d.title).toBe(t(`${e.pushType}.${i}.title`));
        expect(d.body).toBe(t(`${e.pushType}.${i}.body`));
        expect(FUNCTIONS_CATALOGS.push.he).toHaveProperty([`${e.pushType}.${i}.title`]);
      });
    }
  });

  it('selects the same copy for he and an unset locale; a locale without its own catalog falls back to English (en batch 8), never to Hebrew', () => {
    const ctx = { uid: 'u1', now: NOW, vars: { '@שם': 'דנה', '@רמה': '5', '@תוכנית': 'כוח' } };
    const heOut = selectPushCopy('level_up', [], ctx);
    expect(heOut).not.toBeNull();
    expect(selectPushCopy('level_up', [], { ...ctx, locale: 'he' })).toEqual(heOut);
    const enOut = selectPushCopy('level_up', [], { ...ctx, locale: 'en' });
    expect(enOut?.title).toBe('You reached level 5');
    expect(enOut?.title).not.toBe(heOut?.title);
    // de / ru have no push catalog yet: the shared translator chain is locale → en → he
    expect(selectPushCopy('level_up', [], { ...ctx, locale: 'de' })).toEqual({ ...enOut, locale: 'de' });
    expect(defaultRowsFor('level_up', 'he')).toEqual(defaultRowsFor('level_up'));
  });
});
