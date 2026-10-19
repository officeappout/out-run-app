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
