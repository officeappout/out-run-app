/**
 * Sheets batch 2 — flag-OFF parity. The legacy markup of each migrated sheet
 * was recorded from its pre-migration component (the committed snapshot) and
 * must stay byte-identical; only the enable_home_v2 branch moved onto <Sheet>.
 * The v2 cases check that branch renders through the shared primitive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const flags = { enableHomeV2: false };
const userState = { profile: { id: 'u1', core: { isSuperAdmin: false } } };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/features/favorites/components/FavoritesTab', () => ({
  default: ({ v2 }: { v2?: boolean }) => <div data-favorites-tab={v2 ? 'v2' : 'classic'} />,
}));
vi.mock('@/features/workouts/components/WorkoutPreviewDrawer', () => ({ default: () => null }));
vi.mock('@/features/parks/core/services/contribution.service', () => ({ createContribution: async () => {} }));
vi.mock('@/lib/config/app-urls', () => ({ APP_CONFIG_LINKS: { GENERAL_INVITE_ONELINK: 'https://x' } }));

import FavoritesSheet from '@/features/profile/components/FavoritesSheet';
import QuickReportSheet from '@/features/parks/client/components/contribution-wizard/QuickReportSheet';
import UnifiedPlusDrawer from '@/features/parks/client/components/planned-activity/UnifiedPlusDrawer';

const noop = () => {};
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const favorites = (v2: boolean) => html(<FavoritesSheet isOpen onClose={noop} v2={v2} />);
const quickReport = () => html(<QuickReportSheet isOpen onClose={noop} userLocation={{ lat: 1, lng: 2 }} />);
const plus = (withWorkout: boolean) =>
  html(
    <UnifiedPlusDrawer
      isOpen
      onClose={noop}
      onGoTrain={noop}
      onCreateGroup={noop}
      onAddLocation={noop}
      onReport={noop}
      onAddWorkout={withWorkout ? noop : undefined}
    />,
  );

beforeEach(() => {
  flags.enableHomeV2 = false;
});

describe('flag off — byte-identical to the pre-migration markup', () => {
  it('FavoritesSheet', () => {
    expect(favorites(false)).toMatchSnapshot();
  });
  it('QuickReportSheet', () => {
    expect(quickReport()).toMatchSnapshot();
  });
  it('UnifiedPlusDrawer', () => {
    expect(plus(false)).toMatchSnapshot();
  });
});

describe('flag on — the shared <Sheet>', () => {
  it('FavoritesSheet: profile band z 98/99, surface body, IconButton close', () => {
    const out = favorites(true);
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:99');
    expect(out).toContain('z-index:98');
    expect(out).toContain('bg-v2-surface px-4 py-4');
    expect(out).toContain('data-v2-icon-button="surface"');
    expect(out).toContain('data-favorites-tab="v2"');
  });
  it('QuickReportSheet: nested, keyboard-aware (has a textarea), in place', () => {
    flags.enableHomeV2 = true;
    const out = quickReport();
    expect(out).toContain('data-v2-sheet-modal="nested"');
    expect(out).toContain('kb-fit fixed inset-0');
    expect(out).toContain('kb-cap');
    expect(out).toContain('bg-black/30 backdrop-blur-sm');
    expect(out).toContain('<textarea');
    expect(out).toContain('data-v2-icon-button="surface"');
  });
  it('UnifiedPlusDrawer: nested at z 100, blurred backdrop, title header', () => {
    flags.enableHomeV2 = true;
    const out = plus(true);
    expect(out).toContain('data-v2-sheet-modal="nested"');
    expect(out).toContain('z-index:100');
    expect(out).toContain('backdrop-filter:blur(12px)');
    expect(out).toContain('מה תרצה לעשות?');
    expect(out).toContain('הוספת אימון ללו״ז');
    expect(out).not.toContain('kb-');
  });
});
