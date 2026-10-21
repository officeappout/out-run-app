// @vitest-environment jsdom
/**
 * Decision 4 (21.10.2026): t() / useUiGender() get the gender picked during onboarding,
 * which lives only in sessionStorage('onboarding_personal_gender') until the profile is saved.
 * LocaleSync is the one writer of useLocaleStore.gender.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = { profileGender: undefined as string | undefined, pathname: '/onboarding-new/intro' };

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: { enableI18n: false, enableLocaleEn: false, enableLocaleRu: false, enableLocaleDe: false } }),
}));
vi.mock('@/features/user', () => ({
  useUserStore: (sel: (s: unknown) => unknown) =>
    sel({ profile: state.profileGender === undefined ? { core: {} } : { core: { gender: state.profileGender } } }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/lib/i18n/locale-cookie', () => ({ clearLocaleCookie: () => undefined, writeLocaleCookie: () => undefined }));

import LocaleSync from '../LocaleSync';
import { useLocaleStore } from '@/store/useLocaleStore';
import { ONBOARDING_GENDER_EVENT, ONBOARDING_GENDER_KEY } from '@/lib/i18n/gender-copy';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const render = () => act(() => root.render(<LocaleSync />));
const gender = () => useLocaleStore.getState().gender;

beforeEach(() => {
  state.profileGender = undefined;
  state.pathname = '/onboarding-new/intro';
  sessionStorage.clear();
  useLocaleStore.setState({ gender: 'other' });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('LocaleSync — gender for t()', () => {
  it('no profile gender, nothing picked → other (neutral)', () => {
    render();
    expect(gender()).toBe('other');
  });

  it('onboarding pick in sessionStorage → used while the profile has no gender', () => {
    sessionStorage.setItem(ONBOARDING_GENDER_KEY, 'female');
    render();
    expect(gender()).toBe('female');
  });

  it('picked on the identity screen, then navigated → re-read on the route change', () => {
    render();
    expect(gender()).toBe('other');
    sessionStorage.setItem(ONBOARDING_GENDER_KEY, 'male');
    state.pathname = '/onboarding-new/program-path';
    render();
    expect(gender()).toBe('male');
  });

  it('a writer can apply it at once with the event', () => {
    render();
    sessionStorage.setItem(ONBOARDING_GENDER_KEY, 'female');
    act(() => {
      window.dispatchEvent(new Event(ONBOARDING_GENDER_EVENT));
    });
    expect(gender()).toBe('female');
  });

  it('the profile gender wins over the onboarding pick (including an explicit other)', () => {
    sessionStorage.setItem(ONBOARDING_GENDER_KEY, 'female');
    state.profileGender = 'male';
    render();
    expect(gender()).toBe('male');
    state.profileGender = 'other';
    render();
    expect(gender()).toBe('other');
  });
});
