// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `map`, `equipment.*` keys): the equipment drawer's and
 * card's copy moved to src/messages/he/map.json. The snapshots below were
 * recorded from the components BEFORE the extraction; the extracted
 * components must render the same Hebrew markup in every state that shows
 * text: v1 and v2 (enable_home_v2) shells, a full doc (brand line, functional
 * pill, muscles, programs, doc cues, tips, description, brand switcher incl. a
 * nameless brand), auto cues by muscle and the generic fallback, park-pinned,
 * not found, load failed; the card's row (with the video chip) and tile.
 *
 * Rendered with react-dom/client in jsdom: the drawer loads its doc in an
 * effect and portals to document.body, which static markup can't reach.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const flags = { enableHomeV2: false };
const store: { doc: unknown; fail: boolean } = { doc: null, fail: false };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { core: { isSuperAdmin: false } } };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  return { useUserStore };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({
  getGymEquipment: async () => {
    if (store.fail) throw new Error('boom');
    return store.doc;
  },
}));
vi.mock('@/features/content/programs/core/program.service', () => ({
  getAllPrograms: async () => [{ id: 'p1', name: 'פלג גוף עליון' }, { id: 'p2', name: { he: 'רגליים' } }],
}));
vi.mock('@/lib/bunny/BunnyVideoPlayer', () => ({ default: (p: { videoId: string }) => <div data-bunny={p.videoId} /> }));

import { MotionGlobalConfig } from 'framer-motion';
import EquipmentDetailDrawer from '../EquipmentDetailDrawer';
import EquipmentCard from '../EquipmentCard';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Animations jump to their end state, so a snapshot never catches a mid-flight frame.
MotionGlobalConfig.skipAnimations = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
async function mount(el: ReactElement): Promise<string> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  // the doc load (effect → promise) and the programs load
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
  return document.body.innerHTML;
}
const snap = (name: string) => `./__snapshots__/equipment-i18n/${name}.html`;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null;
  host = null;
  flags.enableHomeV2 = false;
  store.doc = null;
  store.fail = false;
});

const full = {
  id: 'eq1', name: { he: 'מתח', en: 'Pull-up bar' }, isFunctional: true,
  primaryMuscle: 'back', secondaryMuscles: ['biceps', 'shoulders'],
  targetPrograms: [{ programId: 'p1', level: 3 }, { programId: 'p2', level: 1 }, { programId: 'p9', level: 2 }],
  cues: ['אחיזה רחבה', 'משיכה עד הסנטר'], tips: ['קל יותר: גומייה', 'קשה יותר: משקולת'],
  description: 'מתקן מתח בגובה 2 מטר',
  brands: [
    { brandName: 'Ludos', imageUrl: 'https://example.com/a.png', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' },
    { brandName: '', imageUrl: '' },
  ],
} as unknown as GymEquipment;
const bare = (muscle?: string) => ({ id: 'eq2', name: 'ספסל', primaryMuscle: muscle, brands: [] }) as unknown as GymEquipment;

describe('EquipmentDetailDrawer — Hebrew markup unchanged by the i18n extraction', () => {
  for (const v2 of [false, true]) {
    const tag = v2 ? 'v2' : 'v1';
    it(`${tag} · full doc`, async () => {
      flags.enableHomeV2 = v2;
      store.doc = full;
      await expect(await mount(<EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="eq1" brandName="Ludos" />))
        .toMatchFileSnapshot(snap(`${tag}-full`));
    });
    it(`${tag} · pinned to the park`, async () => {
      flags.enableHomeV2 = v2;
      store.doc = full;
      await expect(await mount(<EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="eq1" pinnedToPark />))
        .toMatchFileSnapshot(snap(`${tag}-pinned`));
    });
    it(`${tag} · auto cues (legs)`, async () => {
      flags.enableHomeV2 = v2;
      store.doc = bare('legs');
      await expect(await mount(<EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="eq2" />))
        .toMatchFileSnapshot(snap(`${tag}-auto-legs`));
    });
    it(`${tag} · auto cues (generic)`, async () => {
      flags.enableHomeV2 = v2;
      store.doc = bare();
      await expect(await mount(<EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="eq2" />))
        .toMatchFileSnapshot(snap(`${tag}-auto-generic`));
    });
    it(`${tag} · not found`, async () => {
      flags.enableHomeV2 = v2;
      store.doc = null;
      await expect(await mount(<EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="nope" />))
        .toMatchFileSnapshot(snap(`${tag}-not-found`));
    });
    it(`${tag} · load failed`, async () => {
      flags.enableHomeV2 = v2;
      store.fail = true;
      await expect(await mount(<EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="eq1" />))
        .toMatchFileSnapshot(snap(`${tag}-load-failed`));
    });
  }
});

describe('EquipmentCard — Hebrew markup unchanged by the i18n extraction', () => {
  const eq = { id: 'eq1', name: 'מתח', brands: [{ brandName: 'Ludos', imageUrl: 'https://example.com/a.png', videoUrl: 'https://youtu.be/x' }] } as unknown as GymEquipment;
  it('row with brand + video chip', async () => {
    await expect(await mount(<EquipmentCard equipment={eq} brandName="Ludos" />)).toMatchFileSnapshot(snap('card-row'));
  });
  it('row, check slot, selected', async () => {
    await expect(await mount(<EquipmentCard equipment={eq} rightSlot="check" selected />)).toMatchFileSnapshot(snap('card-row-check'));
  });
  it('tile', async () => {
    await expect(await mount(<EquipmentCard equipment={eq} layout="tile" />)).toMatchFileSnapshot(snap('card-tile'));
  });
});
