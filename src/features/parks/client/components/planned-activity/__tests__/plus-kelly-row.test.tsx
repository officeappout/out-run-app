/**
 * enable_home_after_v1 stage 2: Kelly moves from the home top card into the "+" menu. The row shows only in the v2
 * drawer and only when the caller passes onAskKelly (home does that when Kelly is open to the user), first, above
 * the activity section. Static markup, node env.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: true };
const userState: { profile: Record<string, unknown> } = { profile: {} };
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));

import UnifiedPlusDrawer from '../UnifiedPlusDrawer';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const noop = () => {};
const drawer = (onAskKelly?: () => void) =>
  html(<UnifiedPlusDrawer isOpen onClose={noop} onGoTrain={noop} onCreateGroup={noop} onAddLocation={noop} onReport={noop} onAddWorkout={noop} onAskKelly={onAskKelly} />);

beforeEach(() => {
  flags.enableHomeV2 = true;
  userState.profile = { id: 'u1', core: { gender: 'female' } };
});

describe('UnifiedPlusDrawer Kelly row', () => {
  it('no onAskKelly: no Kelly row', () => {
    expect(drawer()).not.toContain('data-plus-kelly');
  });

  it('with onAskKelly: the Kelly row comes first, above the activity section, gendered label', () => {
    const out = drawer(noop);
    expect(out).toContain('data-plus-kelly');
    expect(out).toContain('שאלי את קלי');
    expect(out.indexOf('data-plus-kelly')).toBeLessThan(out.indexOf('פעילות'));
  });

  it('v1 drawer never shows it', () => {
    flags.enableHomeV2 = false;
    expect(drawer(noop)).not.toContain('data-plus-kelly');
  });
});
