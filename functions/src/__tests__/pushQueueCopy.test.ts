/**
 * push_messages (admin broadcast queue): title/message are plain Hebrew strings today, {he,en} once English exists.
 * Hebrew is always the default; English only for a recipient whose push locale resolves to 'en'.
 */
import { describe, expect, it } from 'vitest';
import { englishTextOf, hebrewTextOf } from '../lib/stored-text';
import { partitionUidsByQueueLocale, queueCopiesOf } from '../services/push-queue-copy';

describe('queueCopiesOf', () => {
  it('plain Hebrew doc (every doc today): Hebrew copy, no English, unchanged', () => {
    const c = queueCopiesOf({ title: '  כל הכבוד  ', message: 'הודעה' });
    expect(c).toEqual({ he: { title: 'כל הכבוד', body: 'הודעה' }, en: null });
  });
  it('object-shaped title/message never become "[object Object]"', () => {
    const c = queueCopiesOf({ title: { he: 'כותרת', en: 'Title' }, message: { he: 'גוף', en: 'Body' } });
    expect(c.he).toEqual({ title: 'כותרת', body: 'גוף' });
    expect(c.en).toEqual({ title: 'Title', body: 'Body' });
    expect(JSON.stringify(c)).not.toContain('object Object');
  });
  it('English only when BOTH title and message have it', () => {
    expect(queueCopiesOf({ title: { he: 'כ', en: 'T' }, message: 'גוף' }).en).toBeNull();
    expect(queueCopiesOf({ title: { he: 'כ', en: '' }, message: { he: 'ג', en: 'B' } }).en).toBeNull();
  });
  it('junk values are empty strings (the sender then marks the message failed, as for a missing title)', () => {
    expect(queueCopiesOf({ title: undefined, message: 5 }).he).toEqual({ title: '', body: '' });
    expect(hebrewTextOf(null)).toBe('');
    expect(englishTextOf('plain')).toBe('');
  });
});

describe('partitionUidsByQueueLocale', () => {
  const fakeDb = (locales: Record<string, string | undefined>) =>
    ({
      collection: () => ({ doc: (uid: string) => ({ uid }) }),
      getAll: async (...refs: Array<{ uid: string }>) =>
        refs
          .filter((r) => r.uid)
          .map((r) => ({ id: r.uid, exists: true, data: () => ({ core: { locale: locales[r.uid] } }) })),
    }) as never;

  it('only recipients whose gated locale is en get English; flag-off gate (always he) keeps everyone Hebrew', async () => {
    const db = fakeDb({ a: 'en', b: 'he', c: undefined, d: 'es' });
    const gateOn = async (ctx: { audience: { locale: string | null } }) => (ctx.audience.locale === 'en' ? 'en' : 'he');
    const on = await partitionUidsByQueueLocale(db, ['a', 'b', 'c', 'd'], gateOn);
    expect(Object.fromEntries(on)).toEqual({ a: 'en', b: 'he', c: 'he', d: 'he' });
    const off = await partitionUidsByQueueLocale(db, ['a', 'b'], async () => 'he');
    expect(Object.fromEntries(off)).toEqual({ a: 'he', b: 'he' });
  });
});
