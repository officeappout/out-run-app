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

/** Keys of the library defaults: `<pushType>.<index>.title|body`. */
const isDefaultKey = (k: string) => /^[a-z_]+\.\d+\.(title|body)$/.test(k);

/**
 * The other static push words (senders + the first-week home card), each pasted VERBATIM from the code
 * as it was on origin/main before the extraction.
 */
const OLD_SENDER_LITERALS: Record<string, string> = {
  'chat.someone': 'מישהו',
  'chat.newMessage': '💬 הודעה חדשה',
  'kudos.someone': 'מישהו',
  'kelly.pushTitle': 'קלי',
  'legacy.friend': 'חבר',
  'legacy.near': 'קרוב',
  'workoutType.strength': 'אימון כוח',
  'workoutType.cardio': 'ריצה',
  'workoutType.maintenance': 'אימון קל',
  'workoutType.walking': 'הליכה',
  'workoutType.generic': 'אימון',
  'firstWeekCard.welcome.title': 'הכול מוכן',
  'firstWeekCard.welcome.body': 'בנינו לך אימון ראשון של 12 דקות. בלי ציוד, בלי לחץ.',
  'firstWeekCard.routine.title': 'האימון שלך מחכה בכניסה',
  'firstWeekCard.routine.body': 'הוא כבר חימם את עצמו. 12 דקות ואתם חברים',
  'firstWeekCard.low_bar.title': 'הורדנו את הרף. ממש נמוך',
  'firstWeekCard.low_bar.body': '10 דקות הליכה. זה הכול. גם זה נספר',
  'firstWeekCard.low_bar.cta': 'יוצאים להליכה',
  'firstWeekCard.social.title': 'לא חייבים לבד',
  'firstWeekCard.social.body': 'בגינות ליד הבית יש אנשים שמתאמנים. בואו לראות מי',
  'firstWeekCard.social.cta': 'למפה',
  'firstWeekCard.steps.title': 'הרגליים עשו עבודה יפה היום',
  'firstWeekCard.steps.body': 'כל צעד נספר. סיבוב קצר מסביב לבניין סוגר יום',
  'firstWeekCard.steps.cta': 'לצעדים של היום',
  'firstWeekCard.evening.title': 'היום היה של כולם',
  'firstWeekCard.evening.body': '10 הדקות הבאות יכולות להיות רק שלך',
  'firstWeekCard.in_app.title': 'עוד יום והשבוע הראשון מאחורינו',
  'firstWeekCard.in_app.body': 'אימון קצר של 10 דקות, ומתחילים אותו ברגל ימין',
  'firstWeekCard.fresh_start.title': 'שבוע חדש, דף חדש',
  'firstWeekCard.fresh_start.body': 'בלי להסתכל אחורה. אימון של 10 דקות ומתחילים',
};

describe('push (he) — every key equals the old literal', () => {
  it('covers every default of every pushType, no more, no fewer', () => {
    const expected: Record<string, string> = {};
    for (const e of old) e.defaults.forEach((d, i) => {
      expected[`${e.pushType}.${i}.title`] = d.title;
      expected[`${e.pushType}.${i}.body`] = d.body;
    });
    expect(Object.keys(he).filter(isDefaultKey)).toEqual(Object.keys(expected));
    for (const [key, literal] of Object.entries(expected)) expect(t(key as keyof typeof he)).toBe(literal);
  });

  it('sender words and the first-week card: every key equals the old literal; templated keys keep their old shape', () => {
    expect(Object.keys(he).filter((k) => !isDefaultKey(k)).sort()).toEqual(
      [...Object.keys(OLD_SENDER_LITERALS), 'distance.meters', 'distance.km', 'firstWeekCard.welcome.titleNamed'].sort(),
    );
    for (const [key, literal] of Object.entries(OLD_SENDER_LITERALS)) expect(t(key as keyof typeof he)).toBe(literal);
    // the old templates: `${meters} מטר`, `${(m / 1000).toFixed(1)} ק"מ`, `${name}, הכול מוכן`
    for (const m of [0, 1, 999, 999.5, 1234, 1234567]) expect(t('distance.meters', { meters: String(m) })).toBe(`${m} מטר`);
    for (const m of [1000, 1049, 1050, 1234567]) expect(t('distance.km', { km: (m / 1000).toFixed(1) })).toBe(`${(m / 1000).toFixed(1)} ק"מ`);
    for (const name of ['דנה', "O'Neil {x} <b>", '{name}', '#', 'a,b', '1234']) {
      expect(t('firstWeekCard.welcome.titleNamed', { name })).toBe(`${name}, הכול מוכן`);
    }
  });

  it('the live catalog resolves to the same text', () => {
    expect(PUSH_CATALOG.map((e) => e.pushType)).toEqual(old.map((e) => e.pushType));
    for (const e of PUSH_CATALOG) {
      const o = old.find((x) => x.pushType === e.pushType)!;
      expect(e.defaults.map((d) => [d.title, d.body])).toEqual(o.defaults.map((d) => [d.title, d.body]));
    }
  });

  it('plain copy: the same text for male / female / other / unset gender and any number (no ICU branches to miss)', () => {
    for (const key of (Object.keys(he) as Array<keyof typeof he>).filter(isDefaultKey)) {
      for (const gender of ['male', 'female', 'other', undefined, 'whatever']) {
        expect(t(key, { gender })).toBe(he[key]);
      }
      expect(t(key, { count: String(1234), n: 1234 })).toBe(he[key]);
    }
  });

  it('no message contains ICU syntax (copy uses @vars, never braces, quotes or tags)', () => {
    for (const [key, msg] of Object.entries(he)) {
      if (/^(distance\.|firstWeekCard\.welcome\.titleNamed$)/.test(key)) continue; // the three templated keys: one {arg} each
      expect(/[{}'<>]/.test(msg), key).toBe(false);
    }
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
