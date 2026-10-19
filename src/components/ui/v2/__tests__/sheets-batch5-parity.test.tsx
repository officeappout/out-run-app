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

describe('flag on — the shared <Sheet>', () => {
  beforeEach(() => {
    flags.enableHomeV2 = true;
  });
  it('CreatorManagementDrawer: z 88/89 in place, blurred backdrop, own-scroll body kept', () => {
    const out = creator();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:89');
    expect(out).toContain('z-index:88');
    expect(out).toContain('backdrop-filter:blur(4px)');
    expect(out).toContain('max-h-[88dvh]');
    expect(out).toContain('ניהול קהילה');
    expect(out).toContain('אין חברים רשומים עדיין');
    expect(out).toContain('data-v2-icon-button="surface"');
    // The remove-member ConfirmSheet is closed until a member is picked.
    expect(out).not.toContain('data-v2-confirm-sheet');
  });
  it('UserWorkoutAdjuster: z 199/200 in place, v2 header + the one CTA, body kept', () => {
    const out = adjuster();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:200');
    expect(out).toContain('z-index:199');
    expect(out).toContain('התאמת אימון');
    expect(out).toContain('aria-label="סגור"');
    expect(out).toContain('data-v2-button="cta"');
    expect(out).toContain('עדכן אימון');
    expect(out).toContain('type="range"');
    expect(out).toContain('עמידת ידיים');
  });
  it('LegalDocModal: z 130/131, whole-panel drag, same document text and close button', () => {
    const v2 = legalTerms();
    flags.enableHomeV2 = false;
    const legacy = legalTerms();
    expect(v2).toContain('data-v2-sheet-surface');
    expect(v2).toContain('z-index:131');
    expect(v2).toContain('z-index:130');
    expect(v2).toContain('max-h-[90vh]');
    expect(v2).not.toContain('cursor-grab'); // whole panel drags, no grabber-only zone
    expect(v2).toContain('data-v2-icon-button="surface"');
    // The document body and the footer button are the legacy markup, verbatim.
    const footerAt = legacy.indexOf('<div class="px-5 pt-3 pb-5');
    const body = legacy.slice(legacy.indexOf('<div class="px-6 pt-4'), footerAt);
    const footer = legacy.slice(footerAt, legacy.lastIndexOf('</div>'));
    expect(body.length).toBeGreaterThan(1000);
    expect(footer).toContain('סגור');
    expect(v2).toContain(body);
    expect(v2).toContain(footer);
  });
  it('HealthConnectDisclosureModal: one z-120 layer, same disclosure body, both buttons in order', () => {
    const v2 = healthDisclosure();
    flags.enableHomeV2 = false;
    const legacy = healthDisclosure();
    expect(v2).toContain('data-v2-sheet-modal="nested"');
    expect(v2).toContain('z-index:120');
    expect(v2).toContain('max-w-lg');
    expect(v2).toContain('גישה לנתוני בריאות');
    const body = legacy.slice(legacy.indexOf('<div class="px-5 pb-6 space-y-5">'), legacy.lastIndexOf('</div></div></div>'));
    expect(body).toContain('אפשר גישה');
    expect(v2).toContain(body);
    expect(v2.indexOf('אפשר גישה')).toBeLessThan(v2.indexOf('לא עכשיו'));
  });
  it('SuggestEditSheet: one z-100 layer in place, header + body kept', () => {
    const out = suggestEdit();
    expect(out).toContain('data-v2-sheet-modal="nested"');
    expect(out).toContain('z-index:100');
    expect(out).toContain('max-h-[80vh]');
    expect(out).toContain('עדכן פרטים — גינת הירקון');
    expect(out).toContain('שלח עדכון');
    expect(out).toContain('data-v2-icon-button="surface"');
  });
  it('ViralUnlockSheet: z 90/91 in place, 85vh, close button, body kept', () => {
    const out = viral();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:91');
    expect(out).toContain('z-index:90');
    expect(out).toContain('max-h-[85vh]');
    expect(out).toContain('בונים נבחרת!');
    expect(out).toContain('שלח הזמנה בוואטסאפ');
    expect(out).toContain('data-v2-icon-button="surface"');
  });
  it('ExerciseDetailDrawer: z 200 in place, 95vh, handle drag zone, MEV kept', () => {
    const out = exerciseDetail();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out.match(/z-index:200/g)?.length).toBe(2);
    expect(out).toContain('height:95vh');
    expect(out).toContain('cursor-grab');
    expect(out).toContain('data-mev="park"');
  });
  it('ExistingAccountModal: z 101, no backdrop dismiss, same copy and buttons in order', () => {
    const v2 = existingAccount();
    flags.enableHomeV2 = false;
    const legacy = existingAccount();
    expect(v2).toContain('data-v2-sheet-modal="nested"');
    expect(v2).toContain('z-index:101');
    expect(v2).not.toContain('data-v2-icon-button'); // no ✕ — only the two buttons close it
    const inner = legacy.slice(legacy.indexOf('<h3'), legacy.lastIndexOf('</div></div>') + '</div>'.length);
    expect(inner).toContain('ביטול');
    expect(v2).toContain(inner);
  });
});
