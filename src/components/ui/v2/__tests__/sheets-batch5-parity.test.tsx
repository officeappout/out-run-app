/**
 * Sheets batch 5 — flag-OFF parity. The legacy markup of each migrated sheet
 * was recorded from its pre-migration component (the committed snapshot) and
 * must stay byte-identical; only the enable_home_v2 branch moved onto <Sheet>.
 * The v2 cases check that branch renders through the shared primitive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const flags = { enableHomeV2: false };
const userState = {
  profile: {
    id: 'u1',
    core: {
      isSuperAdmin: false,
      name: 'דנה',
      referralCount: 0,
      affiliations: [{ type: 'city', name: 'תל אביב' }],
    },
  },
};

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

// CreatorManagementDrawer
vi.mock('@/features/arena/services/group.service', () => ({
  getGroupById: () => new Promise(() => {}),
  getGroupMembers: () => new Promise(() => {}),
  makeGroupAdmin: async () => {},
  removeGroupAdmin: async () => {},
  removeGroupMember: async () => {},
}));
// UserWorkoutAdjuster
vi.mock('@/features/workout-engine/services/home-workout.service', () => ({ generateHomeWorkout: async () => ({}) }));
vi.mock('@/features/workout-engine/services/workout-context-resolver', () => ({
  resolveWorkoutContext: async () => ({ availableGear: [] }),
}));
vi.mock('@/features/workout-engine/core/store/useWeeklyVolumeStore', () => ({
  useWeeklyVolumeStore: { getState: () => ({}) },
}));
vi.mock('@/features/home/components/user-workout-adjuster-options.utils', () => ({
  buildAdjusterWorkoutOptions: () => ({}),
}));
// SuggestEditSheet
vi.mock('@/features/parks/core/services/contribution.service', () => ({ createContribution: async () => {} }));
// ExerciseDetailDrawer
vi.mock('@/hooks/useSheetScrollChain', () => ({ useSheetScrollChain: () => ({ scrollRef: { current: null } }) }));
vi.mock('@/features/content/exercises/client/components/MasterExerciseView', () => ({
  default: ({ filterLocation }: { filterLocation: string | null }) => <div data-mev={filterLocation ?? ''} />,
}));

import CreatorManagementDrawer from '@/features/arena/components/CreatorManagementDrawer';
import UserWorkoutAdjuster from '@/features/home/components/UserWorkoutAdjuster';
import LegalDocModal from '@/features/legal/components/LegalDocModal';
import HealthConnectDisclosureModal from '@/components/ui/HealthConnectDisclosureModal';
import SuggestEditSheet from '@/features/parks/client/components/contribution-wizard/SuggestEditSheet';
import ViralUnlockSheet from '@/features/safecity/components/ViralUnlockSheet';
import ExerciseDetailDrawer from '@/features/workouts/components/workout-preview-drawer/components/ExerciseDetailDrawer';
import ExistingAccountModal from '@/components/ExistingAccountModal';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { Park } from '@/features/parks/core/types/park.types';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';

const noop = () => {};
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const creator = () => html(<CreatorManagementDrawer isOpen onClose={noop} groupId="g1" onEditGroup={noop} />);
const adjuster = () =>
  html(
    <UserWorkoutAdjuster
      isOpen
      onClose={noop}
      userProfile={{ progression: { skillFocusIds: ['handstand', 'planche'] } } as unknown as UserFullProfile}
      onApplyAndStart={noop}
      initialLocation={'home' as never}
    />,
  );
const legalTerms = () => html(<LegalDocModal type="terms" isOpen onClose={noop} />);
const legalPrivacy = () => html(<LegalDocModal type="privacy" isOpen onClose={noop} />);
const healthDisclosure = () => html(<HealthConnectDisclosureModal isOpen onConfirm={noop} onDismiss={noop} />);
const park = {
  id: 'p1',
  name: 'גינת הירקון',
  location: { lat: 32.1, lng: 34.8 },
  featureTags: ['shaded', 'has_benches'],
} as unknown as Park;
const suggestEdit = () => html(<SuggestEditSheet isOpen onClose={noop} park={park} />);
const viral = () => html(<ViralUnlockSheet isOpen onClose={noop} />);
const detailExercise = {
  exercise: { id: 'ex1', name: { he: 'שכיבות סמיכה' } },
  method: { location: 'park' },
} as unknown as WorkoutExercise;
const exerciseDetail = () =>
  html(<ExerciseDetailDrawer detailExercise={detailExercise} programMap={{}} onDismiss={noop} />);
const existingAccount = (loading = false) =>
  html(<ExistingAccountModal provider="google" loading={loading} onConfirm={noop} onCancel={noop} />);

beforeEach(() => {
  flags.enableHomeV2 = false;
});

describe('flag off — byte-identical to the pre-migration markup', () => {
  it('CreatorManagementDrawer', () => {
    expect(creator()).toMatchSnapshot();
  });
  it('UserWorkoutAdjuster', () => {
    expect(adjuster()).toMatchSnapshot();
  });
  it('LegalDocModal (terms)', () => {
    expect(legalTerms()).toMatchSnapshot();
  });
  it('LegalDocModal (privacy)', () => {
    expect(legalPrivacy()).toMatchSnapshot();
  });
  it('HealthConnectDisclosureModal', () => {
    expect(healthDisclosure()).toMatchSnapshot();
  });
  it('SuggestEditSheet', () => {
    expect(suggestEdit()).toMatchSnapshot();
  });
  it('ViralUnlockSheet', () => {
    expect(viral()).toMatchSnapshot();
  });
  it('ExerciseDetailDrawer (workout preview)', () => {
    expect(exerciseDetail()).toMatchSnapshot();
  });
  it('ExistingAccountModal', () => {
    expect(existingAccount()).toMatchSnapshot();
  });
  it('ExistingAccountModal (loading)', () => {
    expect(existingAccount(true)).toMatchSnapshot();
  });
});
