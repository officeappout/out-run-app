// @vitest-environment jsdom
/**
 * i18n wave 2 batch ag (namespace `profile`, keys `favorites.*` / `editProfile.*` / `records.*` /
 * `parentProgram.*`): the saved-workouts sheet, the edit-profile screen, the personal-records card
 * and the parent-program sheet move their copy to src/messages/he/profile.json. The snapshots below
 * were recorded from the components BEFORE the extraction; the extracted components must render
 * the same Hebrew markup — v1 and v2 (enable_home_v2) wherever the component has both looks.
 *
 * Rendered with react-dom/client in jsdom (the parent-program sheet portals to document.body after
 * mount and loads its programs in effects). Data hooks / services are mocked (no Firestore);
 * FavoritesTab, the photo uploader and the preview drawer render stubs (other areas' text).
 * Normalised (not text): `<!-- -->`, React useId values and framer-motion animation state
 * (style / opacity / stroke-dash attributes).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const H = vi.hoisted(() => {
  const flags = { enableHomeV2: false };
  const userState: { profile: unknown } = { profile: null };
  const records: { tiles: unknown[]; loading: boolean } = { tiles: [], loading: false };
  return {
    ROUTER: { back() {}, push() {}, replace() {}, prefetch() {} },
    flags,
    FLAGS_RESULT: { flags, loading: false },
    userState,
    records,
    editor: { editSaving: false },
    useUserStoreFake: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
  };
});
const { flags, userState, records } = H;

vi.mock('next/navigation', () => ({ useRouter: () => H.ROUTER }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => H.FLAGS_RESULT }));
vi.mock('@/features/user', () => ({ useUserStore: H.useUserStoreFake }));
vi.mock('@/features/user/identity/store/useUserStore', () => ({ useUserStore: H.useUserStoreFake }));
// FavoritesSheet
vi.mock('@/features/favorites/components/FavoritesTab', () => ({ default: () => <div data-favorites-tab /> }));
vi.mock('@/features/workouts/components/WorkoutPreviewDrawer', () => ({ default: () => null }));
// EditProfileModal
vi.mock('@/components/ui/ProfilePhotoUploader', () => ({
  default: ({ displayName }: { displayName: string }) => <div data-photo-uploader={displayName} />,
}));
vi.mock('@/features/profile/hooks/usePersonalInfoEditor', () => ({
  TRAINING_TAG_OPTIONS: [
    { id: 'running', label: 'ריצה' },
    { id: 'morning', label: 'בוקר' },
  ],
  usePersonalInfoEditor: () => ({
    editName: 'דנה',
    setEditName: () => {},
    editBio: 'רצה בבקרים',
    setEditBio: () => {},
    editTrainingTags: ['running'],
    toggleTrainingTag: () => {},
    editSaving: H.editor.editSaving,
    openPersonalEdit: () => {},
    savePersonalEdit: async () => true,
  }),
}));
// PersonalRecordsCard
vi.mock('../../hooks/useProfileRecords', () => ({ useProfileRecords: () => H.records }));
// ParentProgramSheet
vi.mock('@/features/content/programs', () => ({
  getProgramIcon: (key?: string) => <i data-icon={key ?? ''} />,
  resolveProgramLabel: (slug: string) => `label:${slug}`,
}));
vi.mock('@/features/content/programs/core/program.service', () => ({
  getProgramByTemplateId: async (id: string) =>
    id === 'full_body'
      ? { name: 'כל הגוף', iconKey: 'full_body', subPrograms: ['push', 'pull', 'legs', 'core'] }
      : { name: `תוכנית ${id}`, iconKey: id, maxLevels: 10 },
  getAllPrograms: async () => [],
}));
vi.mock('@/features/user/onboarding/services/mini-domain-assessment', () => ({ startMiniDomainAssessment: () => {} }));
vi.mock('@/lib/progression-map-config', () => ({ resolveProgressionMapDestination: () => '/progression/x' }));

import { MotionGlobalConfig } from 'framer-motion';
import FavoritesSheet from '../FavoritesSheet';
import EditProfileModal from '../EditProfileModal';
import PersonalRecordsCard from '../records/PersonalRecordsCard';
import ParentProgramSheet from '../widgets/ParentProgramSheet';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
MotionGlobalConfig.skipAnimations = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const clean = (h: string) =>
  h
    .replaceAll('<!-- -->', '')
    .replace(/:r[0-9a-z]+:|«r[0-9a-z]+»/g, ':r:')
    .replace(/ (style|opacity|stroke-dasharray|stroke-dashoffset)="[^"]*"/g, '');
async function mount(el: ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
}
const body = () => clean(document.body.innerHTML);
const snap = (name: string) => `./__snapshots__/profile-sheets-i18n/${name}.html`;
const V = (v2: boolean) => (v2 ? 'v2' : 'v1');
const noop = () => {};

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = '';
  flags.enableHomeV2 = false;
  userState.profile = null;
  records.tiles = [];
  records.loading = false;
  H.editor.editSaving = false;
});

describe('saved-workouts sheet', () => {
  it.each([false, true])('open, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    await mount(<FavoritesSheet isOpen onClose={noop} v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`favorites-${V(v2)}`));
  });
});

describe('edit profile', () => {
  it.each([false, true])('with a name, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    userState.profile = { id: 'u1', core: { name: 'דנה', photoURL: '/p.png' } };
    await mount(<EditProfileModal isOpen onClose={noop} />);
    await expect(body()).toMatchFileSnapshot(snap(`edit-${V(v2)}`));
  });
  it.each([false, true])('no name (fallback display name), saving, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    H.editor.editSaving = true;
    userState.profile = { id: 'u1', core: {} };
    await mount(<EditProfileModal isOpen onClose={noop} />);
    await expect(body()).toMatchFileSnapshot(snap(`edit-noname-saving-${V(v2)}`));
  });
});

describe('personal records card', () => {
  const NOW = 1_760_000_000_000;
  const tiles = [
    { key: 'ex:a', icon: 'strength', value: '15', unit: 'חזרות', label: 'מתח · בסט', at: NOW, isNew: true },
    { key: '5k', icon: 'run', value: '24:10', label: '5 ק״מ הכי מהיר', at: NOW - 9 * 86_400_000, isNew: false },
    { key: 'streak', icon: 'streak', value: '9', unit: 'ימים', label: 'רצף הכי ארוך', at: null, isNew: false },
  ];
  it('loading, no tiles yet', async () => {
    records.loading = true;
    await mount(<PersonalRecordsCard active />);
    await expect(body()).toMatchFileSnapshot(snap('records-loading'));
  });
  it('empty', async () => {
    await mount(<PersonalRecordsCard active />);
    await expect(body()).toMatchFileSnapshot(snap('records-empty'));
  });
  it('tiles with a fresh record', async () => {
    records.tiles = tiles;
    await mount(<PersonalRecordsCard active />);
    await expect(body()).toMatchFileSnapshot(snap('records-fresh'));
  });
  it('tiles without a fresh record, unit-less new tile', async () => {
    records.tiles = [
      { key: 'month', icon: 'month', value: '14', unit: 'אימונים', label: 'הכי הרבה בחודש · ספטמבר', at: null, isNew: false },
      { key: 'x', icon: 'walk', value: '7', label: 'הליכה הכי ארוכה', at: NOW, isNew: true },
    ];
    await mount(<PersonalRecordsCard active />);
    await expect(body()).toMatchFileSnapshot(snap('records-unit-less'));
  });
});

describe('parent program sheet', () => {
  const withTracks = {
    id: 'u1',
    core: {},
    progression: {
      tracks: {
        push: { currentLevel: 4, percent: 37, maxLevel: 10 },
        pull: { currentLevel: 3, percent: 20 },
        core: { currentLevel: 2, percent: 80, maxLevel: 10 },
      },
      domains: {},
      skillFocusIds: [],
    },
  };
  it.each([false, true])('assessed + unassessed children, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    userState.profile = withTracks;
    await mount(<ParentProgramSheet parentId="full_body" onClose={noop} v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`parent-mixed-${V(v2)}`));
  });
  it.each([false, true])('nothing assessed, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    userState.profile = { id: 'u1', core: {}, progression: { tracks: {}, domains: {}, skillFocusIds: [] } };
    await mount(<ParentProgramSheet parentId="full_body" onClose={noop} v2={v2} />);
    await expect(body()).toMatchFileSnapshot(snap(`parent-none-${V(v2)}`));
  });
});
