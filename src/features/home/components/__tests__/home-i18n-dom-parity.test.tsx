// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `home`): the home states a static render can't reach — after an async load or a tap.
 * Recorded BEFORE the extraction (same rules as home-i18n-parity.test.tsx): react-dom/client inside act(),
 * framer-motion replaced by plain elements (src/features/user/onboarding/components/steps/__tests__/i18n-dom-harness),
 * stores / services mocked, `<!-- -->` stripped and React `:rN:` ids normalised.
 *
 *  - NearbyGroupsRow: groups loaded (count), the category chips open, a category with no groups.
 *  - MyPersonasSection: the add-persona picker, the remove confirmation (with / without follow-up questions).
 *  - RacePredictionCard: the "how is it calculated" note (based on runs / not yet).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  groups: [] as unknown[],
}));

vi.mock('framer-motion', async () => (await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness')).motionStub);
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, app: {}, storage: {} }));
vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {} };
  return { useRouter: () => router };
});
vi.mock('@/features/user', () => {
  const state = { refreshProfile: async () => {} };
  const useUserStore = (sel?: (s: unknown) => unknown) => {
    const s = { ...state, profile: h.profile };
    return sel ? sel(s) : s;
  };
  return { useUserStore };
});
vi.mock('@/features/parks/core/store/useGPSStore', () => ({
  useGPSStore: { getState: () => ({ requestPermissionIfAllowed: async () => ({ lat: 32.08, lng: 34.78 }) }) },
}));
vi.mock('@/features/arena/services/group.service', () => ({
  getPublicGroups: async () => h.groups, getMyGroups: async () => [], joinGroup: async () => {}, leaveGroup: async () => {},
}));
vi.mock('@/features/arena/components/GroupCard', () => ({ default: ({ group }: { group: { name: string } }) => <div data-group-card="">{group.name}</div> }));
vi.mock('@/features/arena/components/GroupDetailsDrawer', () => ({ default: () => null }));
vi.mock('@/features/arena/hooks/useCommunitySessionBanner', () => {
  const r = { sessions: [] };
  return { useCommunitySessionBanner: () => r };
});
vi.mock('@/features/arena/hooks/usePublicGroupPhases', () => {
  const r = {};
  return { usePublicGroupPhases: () => r };
});
vi.mock('@/features/user/identity/hooks/useResolvedPersonaSummary', () => {
  const r = { loading: false, resolved: true, isComplete: true, parts: ['סדיר'], icon: null };
  return { useResolvedPersonaSummary: () => r };
});
vi.mock('@/features/user/identity/services/persona-answers.service', () => ({ addPersona: async () => {}, removePersona: async () => {} }));
vi.mock('@/features/user/onboarding/components/PersonaQuestionsDrawer', () => ({ default: () => null }));
vi.mock('@/features/user/onboarding/components/steps/PersonaStep', () => ({
  LIFESTYLE_OPTIONS: [{ id: 'parent' }, { id: 'student' }, { id: 'military' }], resolvePersonaEmoji: () => '🙂',
}));
vi.mock('@/components/ui/Toast', () => {
  const r = { showToast: () => {} };
  return { useToast: () => r };
});
vi.mock('@/components/ui/UnitIconBadge', () => ({ default: () => null }));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import { HomeV2Context } from '@/features/home/context/HomeV2Context';
import NearbyGroupsRow from '../NearbyGroupsRow';
import MyPersonasSection from '../settings/MyPersonasSection';
import { RacePredictionCard } from '../widgets/RacePredictionCard';

const snap = (name: string) => `./__snapshots__/home-i18n/dom-${name}.html`;
let m: Mounted | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  h.profile = null;
  h.groups = [];
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const group = (id: string, name: string, category: string) => ({
  id, name, category, source: 'admin', isPublic: true,
  meetingLocation: { location: { lat: 32.081, lng: 34.781 } },
});

describe('NearbyGroupsRow', () => {
  it.each([false, true])('loaded, chips open, empty category (v2=%s)', async (v2) => {
    h.profile = { id: 'u1', core: { name: 'דנה' } };
    h.groups = [group('g1', 'הליכת בוקר', 'walking'), group('g2', 'ריצת ערב', 'running')];
    m = await mount(<HomeV2Context.Provider value={v2}><NearbyGroupsRow /></HomeV2Context.Provider>);
    await m.advance(0);
    const loaded = m.html();
    await m.click('button[aria-expanded]');
    const chips = m.html();
    await m.clickText('כוח');
    const empty = m.html();
    await expect([loaded, chips, empty].join('\n')).toMatchFileSnapshot(snap(`nearby-v${v2 ? 2 : 1}`));
  });
});

describe('MyPersonasSection', () => {
  it('add picker + remove confirmations', async () => {
    h.profile = { core: { gender: 'male' }, personas: [{ id: 'military' }, { id: 'parent' }] };
    m = await mount(<MyPersonasSection />);
    await m.clickText('הוסף פרסונה');
    const picker = m.html();
    await m.click('.fixed.inset-0');
    await m.click('button[aria-label="הסר צה\\"ל"]');
    const removeWithQuestions = m.html();
    await m.clickText('ביטול');
    await m.click('button[aria-label="הסר הורה"]');
    const removePlain = m.html();
    await expect([picker, removeWithQuestions, removePlain].join('\n')).toMatchFileSnapshot(snap('personas'));
  });
});

describe('RacePredictionCard', () => {
  it.each([false, true])('info note, based on runs = %s', async (based) => {
    h.profile = {
      running: {
        isUnlocked: true,
        paceProfile: { basePace: 330, qualityWorkoutsHistory: based ? [{ date: new Date('2026-10-10T08:00:00'), impactOnBasePaceSeconds: -10 }] : [] },
        generatedProgramTemplate: { targetDistance: '5k' },
      },
    };
    m = await mount(<HomeV2Context.Provider value><RacePredictionCard runningProgramsEnabled /></HomeV2Context.Provider>);
    await m.click('button[aria-controls]');
    await expect(m.html()).toMatchFileSnapshot(snap(`race-info-${based ? 'runs' : 'no-runs'}`));
  });
});
