/**
 * Sheets batch 3 — flag-OFF parity. The legacy markup of each migrated sheet
 * was recorded from its pre-migration component (the committed snapshot) and
 * must stay byte-identical; only the enable_home_v2 branch moved onto <Sheet>.
 * The v2 cases check that branch renders through the shared primitive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const flags = { enableHomeV2: false, enableLeagues: true };
const userState = { profile: { id: 'u1', core: { isSuperAdmin: false, name: 'דנה' } } };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('firebase/firestore', () => ({ addDoc: async () => {}, collection: () => ({}), serverTimestamp: () => 0 }));
vi.mock('@/features/profile/components/HistoryTab', () => ({
  default: ({ workouts }: { workouts: unknown[] }) => <div data-history-tab={workouts.length} />,
}));
vi.mock('@/features/social/hooks/useActivityFeed', () => ({
  useActivityFeed: () => ({
    isLoading: false,
    items: [
      { id: 'a1', type: 'high_five', fromUid: 'u2', fromName: 'נועה', read: false, createdAt: new Date(0), message: 'נועה שלחה לך כיף' },
    ],
  }),
}));
vi.mock('@/features/safecity/services/kudos.service', () => ({ sendKudo: async () => {} }));
vi.mock('@/features/social/utils/activity-seen', () => ({ markActivitySeen: () => {} }));
vi.mock('@/features/parks/core/services/contribution.service', () => ({ createContribution: async () => {} }));
vi.mock('@/features/parks/client/components/contribution-wizard/Step1LocationPicker', () => ({
  default: () => <div data-step="location" />,
}));
vi.mock('@/features/parks/client/components/contribution-wizard/Step2Details', () => ({ default: () => <div data-step="details" /> }));
vi.mock('@/features/parks/client/components/contribution-wizard/StepEquipment', () => ({ default: () => <div data-step="equipment" /> }));
vi.mock('@/features/parks/client/components/contribution-wizard/Step3Photo', () => ({ default: () => <div data-step="photo" /> }));

import HistorySheet from '@/features/profile/components/HistorySheet';
import { AchievementSheet } from '@/features/user/progression/components/AchievementSheet';
import ActivityPanel from '@/features/social/components/ActivityPanel';
import ReportContentSheet from '@/features/arena/components/ReportContentSheet';
import NavigationSheet from '@/features/arena/components/NavigationSheet';
import { PartnerFilterSheet } from '@/features/partners/components/PartnerFilterSheet';
import ContributionWizard from '@/features/parks/client/components/contribution-wizard';

const noop = () => {};
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const history = (v2?: boolean) =>
  html(<HistorySheet isOpen onClose={noop} onWorkoutClick={noop} workouts={[]} isLoading={false} removeWorkout={noop} {...(v2 ? { v2 } : {})} />);
const achievements = (v2?: boolean) =>
  html(<AchievementSheet isOpen onClose={noop} unlockedAchievements={{}} {...(v2 ? { v2 } : {})} />);
const activity = () => html(<ActivityPanel isOpen onClose={noop} />);
const report = () =>
  html(<ReportContentSheet isOpen onClose={noop} targetId="g1" targetType="group" targetName="רצים בפארק" reporterId="u1" />);
const navigation = () => html(<NavigationSheet isOpen onClose={noop} lat={32.1} lng={34.8} label="פארק הירקון" />);
const partnerFilter = () => html(<PartnerFilterSheet isOpen onClose={noop} />);
const wizard = () => html(<ContributionWizard isOpen onClose={noop} />);

beforeEach(() => {
  flags.enableHomeV2 = false;
});

describe('flag off — byte-identical to the pre-migration markup', () => {
  it('HistorySheet', () => {
    expect(history()).toMatchSnapshot();
  });
  it('AchievementSheet', () => {
    expect(achievements()).toMatchSnapshot();
  });
  it('ActivityPanel', () => {
    expect(activity()).toMatchSnapshot();
  });
  it('ReportContentSheet', () => {
    expect(report()).toMatchSnapshot();
  });
  it('NavigationSheet', () => {
    expect(navigation()).toMatchSnapshot();
  });
  it('PartnerFilterSheet', () => {
    expect(partnerFilter()).toMatchSnapshot();
  });
  it('ContributionWizard', () => {
    expect(wizard()).toMatchSnapshot();
  });
});

describe('flag on — the shared <Sheet>', () => {
  it('HistorySheet: profile band z 98/99, in place, tinted body, IconButton close', () => {
    const out = history(true);
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:99');
    expect(out).toContain('z-index:98');
    expect(out).toContain('bg-v2-surface px-4 py-4');
    expect(out).toContain('data-v2-icon-button="surface"');
    expect(out).toContain('היסטוריית אימונים');
    expect(out).toContain('data-history-tab="0"');
  });
  it('AchievementSheet: profile band, count line in the header', () => {
    const out = achievements(true);
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:99');
    expect(out).toContain('הישגים שלי');
    expect(out).toContain('נפתחו');
    expect(out).toContain('data-v2-icon-button="surface"');
  });
  it('ActivityPanel: z 70/71, default title header, items kept', () => {
    flags.enableHomeV2 = true;
    const out = activity();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:71');
    expect(out).toContain('z-index:70');
    expect(out).toContain('פעילות');
    expect(out).toContain('data-v2-icon-button="surface"');
    expect(out).toContain('בחזרה');
  });
  it('ReportContentSheet: community band z 92/93, blurred backdrop, tint reasons, danger CTA', () => {
    flags.enableHomeV2 = true;
    const out = report();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:93');
    expect(out).toContain('z-index:92');
    expect(out).toContain('backdrop-filter:blur(4px)');
    expect(out).toContain('דיווח על הקבוצה');
    expect(out).toContain('shadow-v2-ring');
    expect(out).toContain('bg-v2-down');
    expect(out).toContain('data-v2-icon-button="surface"');
  });
  it('NavigationSheet: z 95/96, width-capped, label subtitle', () => {
    flags.enableHomeV2 = true;
    const out = navigation();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:96');
    expect(out).toContain('z-index:95');
    expect(out).toContain('max-w-md mx-auto');
    expect(out).toContain('פארק הירקון');
    expect(out).toContain('Google Maps');
  });
  it('PartnerFilterSheet: z 95/96, grabber drag zone, pinned CTA footer', () => {
    flags.enableHomeV2 = true;
    const out = partnerFilter();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:96');
    expect(out).toContain('z-index:95');
    expect(out).toContain('cursor-grab');
    expect(out).toContain('bg-v2-cta');
    expect(out).toContain('איפוס');
    expect(out).toContain('calc(env(safe-area-inset-bottom, 0px) + 12px)');
  });
  it('ContributionWizard: nested, keyboard-aware, z 100, in place', () => {
    flags.enableHomeV2 = true;
    const out = wizard();
    expect(out).toContain('data-v2-sheet-modal="nested"');
    expect(out).toContain('kb-fit fixed inset-0');
    expect(out).toContain('kb-cap');
    expect(out).toContain('z-index:100');
    expect(out).toContain('bg-black/30 backdrop-blur-sm');
    expect(out).toContain('min-h-[85vh] max-h-[95vh]');
    expect(out).toContain('data-step="location"');
    expect(out).toContain('data-v2-icon-button="surface"');
  });
});
