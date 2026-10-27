// @vitest-environment jsdom
/**
 * i18n wave 2 batch az (namespace `library`, keys exercises.equipSheet.*): Hebrew markup parity of the
 * equipment & location sheet (EquipmentFilterSheet + EquipmentFilterShell) in its three modes, v1 / v2.
 *
 * Snapshots recorded BEFORE the extraction, from unmodified origin/main. jsdom + react-dom/client
 * (shared harness): framer-motion is replaced by plain elements, the gear catalog is a small fixture.
 * `<!-- -->` is stripped and React `:rN:` ids are normalised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, motionStub, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';

const S = vi.hoisted(() => ({ v2: false, gearFails: false }));
const GEAR = vi.hoisted(() => [
  { id: 'g_pull', name: { he: 'מתח', en: 'Pull-up bar' }, category: 'stationary' },
  { id: 'g_chair', name: { he: 'כיסא', en: 'Chair' }, category: 'improvised' },
  { id: 'g_band', name: { he: 'גומייה', en: 'Band' }, category: 'resistance' },
]);

vi.mock('framer-motion', async (importOriginal) => ({ ...(await importOriginal<object>()), ...motionStub }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), updateDoc: async () => {} }));
vi.mock('@/lib/firestore.service', () => ({ getUserFromFirestore: async () => null }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: S.v2 } }) }));
vi.mock('@/features/user', () => {
  const state = { profile: null };
  const useUserStore = Object.assign((sel?: (s: unknown) => unknown) => (sel ? sel(state) : state), { setState: () => {} });
  return { useUserStore };
});
vi.mock('@/features/content/equipment/gear/core/gear-definition.service', () => ({
  getAllGearDefinitions: async () => {
    if (S.gearFails) throw new Error('boom');
    return GEAR;
  },
}));
vi.mock('@/features/workout-engine/shared/utils/gear-mapping.utils', () => ({
  resolveEquipmentSvgPathList: () => [],
  ensureEquipmentCachesLoaded: async () => {},
}));

import EquipmentFilterSheet from '../components/EquipmentFilterSheet';
import { BODYWEIGHT_SENTINEL } from '../store/useExerciseLibraryStore';

const snap = (name: string) => `./__snapshots__/equipment-sheet-az-i18n/${name}.html`;
let m: Mounted | null = null;
const noop = () => {};

beforeEach(() => {
  S.v2 = false;
  S.gearFails = false;
});
afterEach(() => {
  m?.unmount();
  m = null;
});

const MODES = ['filter', 'profile', 'inline-onboarding'] as const;

describe('equipment sheet', () => {
  it.each(MODES.flatMap((mode) => [false, true].map((v2) => [mode, v2] as const)))('%s, v2=%s, loaded, empty draft', async (mode, v2) => {
    S.v2 = v2;
    m = await mount(<EquipmentFilterSheet isOpen onClose={noop} mode={mode} initialIds={[]} onboardingV2={v2} />);
    await expect(m.html()).toMatchFileSnapshot(snap(`${mode}-v${v2 ? 2 : 1}-loaded`));
  });

  it.each([false, true])('filter, v2=%s, gear failed to load', async (v2) => {
    S.v2 = v2;
    S.gearFails = true;
    m = await mount(<EquipmentFilterSheet isOpen onClose={noop} initialIds={[]} />);
    await expect(m.html()).toMatchFileSnapshot(snap(`filter-v${v2 ? 2 : 1}-error`));
  });

  const SUMMARY: Array<[string, string[]]> = [
    ['park', [BODYWEIGHT_SENTINEL, 'g_pull']],
    ['home', [BODYWEIGHT_SENTINEL, 'g_chair']],
    ['gym', [BODYWEIGHT_SENTINEL, 'g_pull', 'g_chair', 'g_band']],
    ['bodyweight-only', [BODYWEIGHT_SENTINEL]],
    ['custom-two', ['g_band', 'g_chair']],
    ['custom-one-with-bw', [BODYWEIGHT_SENTINEL, 'g_band']],
  ];
  it.each(SUMMARY.flatMap(([n, ids]) => [false, true].map((v2) => [n, ids, v2] as const)))('filter summary: %s (v2=%s)', async (name, ids, v2) => {
    S.v2 = v2;
    m = await mount(<EquipmentFilterSheet isOpen onClose={noop} initialIds={[...ids]} />);
    await expect(m.html()).toMatchFileSnapshot(snap(`summary-${name}-v${v2 ? 2 : 1}`));
  });

  it('closed sheet renders nothing', async () => {
    m = await mount(<EquipmentFilterSheet isOpen={false} onClose={noop} initialIds={[]} />);
    expect(m.html()).not.toMatch(/[א-ת]/);
  });
});
