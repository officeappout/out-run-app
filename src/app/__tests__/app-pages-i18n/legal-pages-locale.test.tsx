/**
 * Legal pages in English: ?lang=en / out_locale=en render English (en/ltr) only while the STORED flags
 * enable_i18n + enable_locale_en are on; otherwise the Hebrew markup is the recorded snapshot exactly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, flags: {} as Record<string, boolean> }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (n: string) => (n === 'out_locale' && state.cookie ? { value: state.cookie } : undefined) }),
}));
vi.mock('@/lib/ai/entitlement.server', () => ({ getServerFeatureFlags: async () => state.flags }));

import AccessibilityPage, { generateMetadata as a11yMeta } from '@/app/accessibility/page';
import PrivacyPage, { generateMetadata as privacyMeta } from '@/app/privacy/page';
import DeleteDataPage, { generateMetadata as deleteMeta } from '@/app/delete-data/page';

type Page = (p: { searchParams?: Record<string, string> }) => Promise<ReactElement>;
const render = async (Page: Page, searchParams: Record<string, string> = {}) =>
  renderToStaticMarkup(await Page({ searchParams })).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/static/${name}.html`;
const PAGES: Array<[string, Page]> = [
  ['accessibility', AccessibilityPage as Page],
  ['privacy', PrivacyPage as Page],
  ['delete-data', DeleteDataPage as Page],
];
const ON = { enableI18n: true, enableLocaleEn: true, enableLocaleRu: false, enableLocaleDe: false };

beforeEach(() => {
  state.cookie = undefined;
  state.flags = {};
});

describe('flags off → Hebrew snapshot even when English is requested', () => {
  it.each(PAGES)('%s', async (name, Page) => {
    state.cookie = 'en';
    state.flags = { ...ON, enableLocaleEn: false };
    await expect(await render(Page, { lang: 'en' })).toMatchFileSnapshot(snap(name));
    state.flags = { ...ON, enableI18n: false };
    await expect(await render(Page)).toMatchFileSnapshot(snap(name));
  });
});

describe('flags on → English, ltr', () => {
  it('cookie en', async () => {
    state.cookie = 'en';
    state.flags = ON;
    const out = await render(PrivacyPage as Page);
    expect(out).toMatch(/^<div class="[^"]*" dir="ltr" lang="en">/);
    expect(out).toContain('2. Health Data: Apple HealthKit and Google Health Connect');
    expect(out).toContain('bg-sky-50'); // the health section still gets its styling
    expect(out).toContain('Absolute commitments');
    expect(out).toContain('October 2026');
    expect(out).not.toMatch(/[֐-׿]/);
  });

  it('?lang=en without a cookie; ?lang=he beats an en cookie', async () => {
    state.flags = ON;
    const a11y = await render(AccessibilityPage as Page, { lang: 'en' });
    expect(a11y).toMatch(/dir="ltr" lang="en"/);
    expect(a11y).toContain('October 27, 2026');
    expect(a11y).toContain('list-disc ps-5');
    expect(a11y).not.toContain('pr-5');
    const del = await render(DeleteDataPage as Page, { lang: 'en' });
    expect(del).toMatch(/dir="ltr" lang="en"/);
    expect(del).toContain('href="/privacy?lang=en"');
    state.cookie = 'en';
    await expect(await render(DeleteDataPage as Page, { lang: 'he' })).toMatchFileSnapshot(snap('delete-data'));
  });

  it('metadata', async () => {
    state.flags = ON;
    const sp = { searchParams: { lang: 'en' } };
    expect((await privacyMeta(sp)).title).toBe('Privacy Policy | OUT');
    expect((await a11yMeta(sp)).title).not.toMatch(/[֐-׿]/);
    expect((await deleteMeta(sp)).title).not.toMatch(/[֐-׿]/);
  });
});
