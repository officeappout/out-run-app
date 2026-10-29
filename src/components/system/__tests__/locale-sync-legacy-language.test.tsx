// @vitest-environment jsdom
/**
 * English audit (29.10.2026): the legacy he/en dictionary screens read useAppStore.language, which only the
 * explicit language picker synced. LocaleSync now mirrors the resolved locale into it, only with enable_i18n on.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = { i18n: true, stored: 'en' as string | null };

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    flags: { enableI18n: state.i18n, enableLocaleEn: true, enableLocaleRu: false, enableLocaleDe: false },
  }),
}));
vi.mock('@/features/user', () => ({ useUserStore: (sel: (s: unknown) => unknown) => sel({ profile: { core: {} } }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));
vi.mock('@/lib/i18n/locale-cookie', () => ({ clearLocaleCookie: () => undefined, writeLocaleCookie: () => undefined }));
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPrefAsync: async () => state.stored }));

import LocaleSync from '../LocaleSync';
import { useAppStore } from '@/store/useAppStore';
import { useLocaleStore } from '@/store/useLocaleStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const render = async () => {
  await act(async () => {
    root.render(<LocaleSync />);
  });
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  state.i18n = true;
  state.stored = 'en';
  useAppStore.setState({ language: 'he', direction: 'rtl' });
  useLocaleStore.setState({ locale: 'he', i18nEnabled: false });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('LocaleSync mirrors the locale into the legacy language store', () => {
  it('English resolved (stored pref) → legacy language en', async () => {
    await render();
    expect(useLocaleStore.getState().locale).toBe('en');
    expect(useAppStore.getState().language).toBe('en');
  });

  it('Hebrew resolved → legacy language stays he', async () => {
    state.stored = 'he';
    await render();
    expect(useAppStore.getState().language).toBe('he');
  });

  it('enable_i18n off → the legacy store is never touched', async () => {
    state.i18n = false;
    useAppStore.setState({ language: 'en', direction: 'ltr' });
    await render();
    expect(useAppStore.getState().language).toBe('en');
  });
});
