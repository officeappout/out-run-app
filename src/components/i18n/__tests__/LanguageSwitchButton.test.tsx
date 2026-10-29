import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeT } from '@/lib/i18n/t';
import { common } from '@/messages/ns/common';

const state = vi.hoisted(() => ({
  hook: { options: [] as { value: string; name: string }[], locale: 'he', choose: vi.fn() },
}));
vi.mock('@/hooks/useLanguageSetting', () => ({ useLanguageSetting: () => state.hook }));

import { LanguageSwitchButton } from '../LanguageSwitchButton';
import { IntroLanding } from '@/features/user/onboarding/intro/components/IntroLanding';

const OPTS = [{ value: 'he', name: 'עברית' }, { value: 'en', name: 'English' }];

describe('LanguageSwitchButton', () => {
  beforeEach(() => { state.hook = { options: [], locale: 'he', choose: vi.fn() }; });

  it('renders nothing with the flags off', () => {
    expect(renderToStaticMarkup(<LanguageSwitchButton />)).toBe('');
  });

  it('intro landing markup is identical to the bare component output with flags off (parity)', () => {
    const html = renderToStaticMarkup(<IntroLanding onQuickSignup={() => {}} onLogin={() => {}} />);
    expect(html).not.toContain('<button type="button" aria-label');
    expect(html).not.toContain('English');
  });

  it('shows the target language and an accessible label with flags on', () => {
    state.hook = { options: OPTS, locale: 'he', choose: vi.fn() };
    const html = renderToStaticMarkup(<LanguageSwitchButton />);
    expect(html).toContain('English');
    expect(html).toContain(`aria-label="${makeT('he', common)('language.switch.aria')}"`);
    expect(html).toContain('end-3');
    state.hook = { options: OPTS, locale: 'en', choose: vi.fn() };
    expect(renderToStaticMarkup(<LanguageSwitchButton />)).toContain('עברית');
  });

  it('a tap targets the other language when two are enabled, a menu when more', async () => {
    const { singleTarget } = await import('../LanguageSwitchButton');
    expect(singleTarget(OPTS as never, 'he' as never)).toBe('en');
    expect(singleTarget(OPTS as never, 'en' as never)).toBe('he');
    expect(singleTarget([...OPTS, { value: 'ru', name: 'Русский' }] as never, 'he' as never)).toBeNull();
    state.hook = { options: [...OPTS, { value: 'ru', name: 'Русский' }], locale: 'he', choose: vi.fn() };
    const html = renderToStaticMarkup(<LanguageSwitchButton />);
    expect(html).toContain('aria-haspopup="menu"');
  });
});
