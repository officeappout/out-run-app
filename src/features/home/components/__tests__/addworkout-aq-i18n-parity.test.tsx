// @vitest-environment jsdom
/**
 * i18n wave 2 batch aq (namespace `home`, keys `addWorkout.*`): AddWorkoutModal — v1 + v2 chrome, new / edit,
 * with / without a target date, every gender, every type, track pills. Snapshots recorded BEFORE the extraction
 * from unmodified origin/main (jsdom mount, `<!-- -->` stripped, ids normalised).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  v2: false,
  gender: 'male' as string | undefined,
  tracks: {} as Record<string, unknown>,
}));

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/features/home/context/HomeV2Context', () => ({ useHomeV2: () => h.v2 }));
vi.mock('@/components/ui/DrumTimePicker', () => ({ DrumTimePicker: () => <i data-drum="" /> }));
vi.mock('@/components/ui/v2/Sheet', () => ({
  default: (p: { open: boolean; title?: string; children?: React.ReactNode }) =>
    p.open ? (
      <div data-sheet="">
        <h2>{p.title}</h2>
        {p.children}
      </div>
    ) : null,
}));
vi.mock('@/components/ui/ClassicFormSheet', () => ({
  default: (p: { isOpen: boolean; title?: string; children?: React.ReactNode }) =>
    p.isOpen ? (
      <div data-classic="">
        <h2>{p.title}</h2>
        {p.children}
      </div>
    ) : null,
}));
vi.mock('@/features/activity/store/useActivityStore', () => {
  const state = { weeklySummary: null, logWorkout: () => {}, history: [] };
  return { useActivityStore: (sel: (s: typeof state) => unknown) => sel(state) };
});
vi.mock('@/features/user/scheduling/services/userSchedule.service', () => ({ upsertScheduleEntry: async () => {} }));
vi.mock('@/features/social/services/feed.service', () => ({ createWorkoutPost: async () => {} }));
vi.mock('@/features/social/services/feed-scope.utils', () => ({ extractFeedScope: () => ({}), extractGroupIds: () => [] }));
vi.mock('@/features/user', () => {
  const state = () => ({
    profile: { id: 'u1', core: { name: 'דנה', gender: h.gender }, progression: { activePrograms: [], tracks: h.tracks } },
  });
  const useUserStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state());
  useUserStore.getState = state;
  return { useUserStore };
});
vi.mock('@/features/safecity/store/usePrivacyStore', () => ({ usePrivacyStore: { getState: () => ({ mode: 'public' }) } }));
vi.mock('@/features/parks/core/store/useGPSStore', () => ({ useGPSStore: { getState: () => ({ coords: null }) } }));
vi.mock('@/features/admin/services/planned-sessions.service', () => ({ createPlannedSession: async () => {} }));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import { useLocaleStore } from '@/store/useLocaleStore';
import AddWorkoutModal from '../AddWorkoutModal';

const snap = (name: string) => `./__snapshots__/addworkout-aq-i18n/${name}.html`;
let m: Mounted | null = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  h.v2 = false;
  h.gender = 'male';
  h.tracks = { pushup: { currentLevel: 3 }, zzzUnknownTrackId: { currentLevel: 1 } };
  useLocaleStore.setState({ gender: 'male' });
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('AddWorkoutModal', () => {
  it.each([false, true])('new workout: every gender, with / without a date, every type, v2=%s', async (v2) => {
    h.v2 = v2;
    const parts: string[] = [];
    const render = async (props: Record<string, unknown> = {}, mod?: () => Promise<void>) => {
      m?.unmount();
      m = await mount(<AddWorkoutModal isOpen onClose={() => {}} userId="u1" {...props} />);
      for (let i = 0; i < 3; i++) await m.advance(0);
      if (mod) await mod();
      parts.push(m.html());
    };
    for (const gender of ['male', 'female', 'other'] as const) {
      h.gender = gender === 'other' ? undefined : gender;
      useLocaleStore.setState({ gender });
      await render({ targetDate: '2026-10-24' });
    }
    h.gender = 'male';
    useLocaleStore.setState({ gender: 'male' });
    await render();
    await render({ targetDate: '2026-10-25' }, async () => m!.clickText('ריצה'));
    await render({ targetDate: '2026-10-31' }, async () => m!.clickText('הליכה'));
    await expect(parts.join('\n')).toMatchFileSnapshot(snap(`new-v${v2 ? 2 : 1}`));
  });

  it.each([false, true])('edit mode and no tracks, v2=%s', async (v2) => {
    h.v2 = v2;
    h.tracks = {};
    m = await mount(<AddWorkoutModal isOpen onClose={() => {}} userId="u1" initialEntryId="e1" initialType="running" initialStartTime="07:00" initialTitle="ריצת בוקר" targetDate="2026-10-22" />);
    for (let i = 0; i < 3; i++) await m.advance(0);
    await expect(m.html()).toMatchFileSnapshot(snap(`edit-v${v2 ? 2 : 1}`));
  });
});
