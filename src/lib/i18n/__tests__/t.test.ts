import { beforeEach, describe, expect, it } from 'vitest';
import { common } from '@/messages/ns/common';
import heCommon from '@/messages/he/common.json';
import { __resetCatalogsForTests, defineNamespace, ensureCatalog, getCatalog, registerCatalog } from '../catalogs';
import { getT, makeT } from '../t';

beforeEach(() => __resetCatalogsForTests());

describe('makeT / getT', () => {
  it('Hebrew is there synchronously and byte-identical to the catalog', () => {
    const t = makeT('he', common);
    for (const [key, message] of Object.entries(heCommon)) {
      if (!message.includes('{')) expect(t(key as keyof typeof heCommon)).toBe(message);
    }
  });

  it('injects the gender (option) unless the caller passes one', () => {
    expect(makeT('he', common, { gender: 'female' })('greeting.ready')).toBe('מוכנה?');
    expect(makeT('he', common, { gender: 'female' })('greeting.ready', { gender: 'male' })).toBe('מוכן?');
    expect(makeT('he', common)('greeting.ready')).toBe('מוכנים?');
  });

  it('before English loads, en falls back to Hebrew; after, it is English', async () => {
    expect(makeT('en', common)('actions.save')).toBe('שמירה');
    const t = await getT('en', common);
    expect(t('actions.save')).toBe('Save');
    expect(t('count.minutes', { count: 1 })).toBe('1 minute');
    expect(t.locale).toBe('en');
  });

  it('ru / de load lazily and fall back to en → he (empty catalogs today)', async () => {
    await ensureCatalog('ru', 'common');
    expect(getCatalog('ru', 'common')).toEqual({});
    const t = await getT('de', common);
    expect(t('actions.close')).toBe('Close');
  });

  it('a namespace with no file for a locale resolves to an empty catalog, never throws', async () => {
    const ns = defineNamespace('no-such-namespace-for-test', { hi: 'היי' });
    const t = await getT('en', ns);
    expect(t('hi')).toBe('היי');
  });

  it('rich(): tags become values, plain t() treats them as text', () => {
    const ns = defineNamespace('rich-test', { terms: 'קראתי את <link>התנאים</link>', lt: 'פחות מ-<5 דקות' });
    registerCatalog('en', 'rich-test', { terms: 'I read the <link>terms</link>' });
    const he = makeT('he', ns);
    expect(he.rich<{ tag: string }>('terms', { link: (c: unknown[]) => ({ tag: c.join('') }) })).toEqual([
      'קראתי את ',
      { tag: 'התנאים' },
    ]);
    expect(he('lt')).toBe('פחות מ-<5 דקות');
    expect(makeT('en', ns).rich('terms', { link: (c: unknown[]) => `[${c.join('')}]` })).toEqual(['I read the [terms]']); // string parts merge
  });
});
