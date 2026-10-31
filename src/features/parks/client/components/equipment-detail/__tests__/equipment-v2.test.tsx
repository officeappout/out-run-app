// @vitest-environment jsdom
/**
 * Park page equipment (enable_place_workouts_v1, owner feedback 26.10):
 *  - the tile's picture follows the drawer's chain (park brand → any brand photo → Bunny still), else none;
 *  - "תרגילים לפי רמה": the catalog exercises on this machine, lowest level first; < 2 → no section;
 *  - the facts (level span, program chips);
 *  - the drawer: flag on → the exercise-page body (hero, facts, levels, muscles, cues); flag off → unchanged
 *    (equipment-i18n-parity.test.tsx keeps its snapshots); no machine levels → no levels section;
 *  - i18n: every equipment.v2.* key used exists and none is orphaned; no Hebrew in the new folders.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import he from '@/messages/he/map.json';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

const flags = { enableHomeV2: true, enablePlaceWorkoutsV1: true, enableEquipmentScanV1: false };
const store: { doc: unknown; catalog: unknown[] } = { doc: null, catalog: [] };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { core: { isSuperAdmin: false } } };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  return { useUserStore };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({ getGymEquipment: async () => store.doc }));
vi.mock('@/features/content/programs/core/program.service', () => ({ getAllPrograms: async () => [{ id: 'p1', name: 'פלג גוף עליון' }] }));
vi.mock('@/features/content/exercises/core/exercise-catalog', () => ({ getExerciseCatalog: async () => store.catalog }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {} }) }));
vi.mock('@/features/workout-engine/services/program-hierarchy.utils', () => ({ getCachedPrograms: async () => [{ id: 'p1', name: 'משיכה' }] }));
vi.mock('@/lib/bunny/BunnyVideoPlayer', () => ({ default: (p: { videoId: string }) => <div data-bunny={p.videoId} /> }));

import EquipmentDetailDrawer from '../EquipmentDetailDrawer';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { equipmentImageUrl } from '../equipment-media';
import { equipmentLevelItems } from '../v2/equipment-levels';
import { equipmentLevelSpan, equipmentProgramChips } from '../v2/equipment-facts';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ex = (id: string, name: string, level: number | null, equipmentIds: string[], role?: string) => ({
  id, name: { he: name }, exerciseRole: role,
  targetPrograms: level != null ? [{ programId: 'p1', level }] : [],
  execution_methods: [{ location: 'park', equipmentIds, media: { imageUrl: `https://img/${id}.jpg` } }],
}) as unknown as Exercise;

const catalog = [
  ex('e3', 'מתח רחב', 3, ['eq1']),
  ex('e1', 'מתח אוסטרלי', 1, ['eq1']),
  ex('w', 'חימום תלייה', 1, ['eq1'], 'warmup'),
  ex('x', 'שכיבות סמיכה', 2, []),
  ex('e2', 'מתח שלילי', 2, ['eq1']),
];

describe('equipmentImageUrl', () => {
  it('park brand photo → another brand photo → Bunny still → none', () => {
    const brands = [{ brandName: 'Ludos', imageUrl: '' }, { brandName: 'Urbanics', imageUrl: 'https://img/u.png' }];
    expect(equipmentImageUrl({ brands }, 'Ludos')).toBe('https://img/u.png');
    expect(equipmentImageUrl({ brands: [{ brandName: 'A', imageUrl: 'https://img/a.png' }] }, null)).toBe('https://img/a.png');
    const still = equipmentImageUrl({ brands: [{ brandName: 'A', videoUrl: 'https://vz.b-cdn.net/0f8a1c2e-1111-2222-3333-444455556666/play_720p.mp4' }] }, 'A');
    expect(still).toContain('0f8a1c2e-1111-2222-3333-444455556666');
    expect(equipmentImageUrl({ brands: [] }, null)).toBeNull();
    expect(equipmentImageUrl({ brands: [{ brandName: 'A' }] }, 'A')).toBeNull();
  });
});

describe('equipmentLevelItems', () => {
  it('the machine’s exercises, lowest level first, warm-ups skipped', () => {
    const items = equipmentLevelItems(catalog, 'eq1', 'he');
    expect(items.map((i) => [i.id, i.level])).toEqual([['e1', 1], ['e2', 2], ['e3', 3]]);
    expect(items[0]).toMatchObject({ name: 'מתח אוסטרלי', thumb: 'https://img/e1.jpg' });
  });
  it('fewer than two → no levels', () => {
    expect(equipmentLevelItems([catalog[0]], 'eq1', 'he')).toEqual([]);
    expect(equipmentLevelItems(catalog, 'none', 'he')).toEqual([]);
  });
});

describe('equipment facts', () => {
  it('level span and program chips', () => {
    expect(equipmentLevelSpan({ targetPrograms: [{ programId: 'a', level: 4 }, { programId: 'b', level: 2 }] } as never)).toEqual({ from: 2, to: 4 });
    expect(equipmentLevelSpan({ targetPrograms: [] } as never)).toBeNull();
    expect(equipmentProgramChips({ targetPrograms: [{ programId: 'p1', level: 3 }, { programId: 'zz', level: 1 }] } as never, [{ id: 'p1', name: { he: 'כוח' } }], 'he'))
      .toEqual([{ programId: 'p1', label: 'כוח', level: 3 }, { programId: 'zz', label: 'zz', level: 1 }]);
  });
});

let root: Root | null = null;
async function mount(el: ReactElement): Promise<string> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
  return document.body.innerHTML;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  root = null;
  flags.enablePlaceWorkoutsV1 = true;
  store.catalog = [];
});

const doc = {
  id: 'eq1', name: 'מתח', isFunctional: true, primaryMuscle: 'back', secondaryMuscles: ['biceps'],
  targetPrograms: [{ programId: 'p1', level: 3 }], cues: ['אחיזה רחבה'], tips: [],
  brands: [{ brandName: 'Ludos', imageUrl: 'https://img/eq.png' }],
} as unknown as GymEquipment;

describe('EquipmentDetailDrawer — exercise-page design (flag on)', () => {
  it('hero photo, title, facts, programs, levels, muscles, cues', async () => {
    store.doc = doc;
    store.catalog = catalog;
    const html = await mount(<EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="eq1" brandName="Ludos" pinnedToPark />);
    expect(html).toContain('data-equipment-v2');
    expect(html).toContain('https://img/eq.png');
    expect(html).toContain('רמה 3');
    expect(html).toContain('פלג גוף עליון · רמה 3');
    expect(html).toContain('data-equipment-levels');
    expect(html).toContain('תרגילים לפי רמה');
    expect(html.indexOf('מתח אוסטרלי')).toBeLessThan(html.indexOf('מתח רחב'));
    expect(html).toContain('שרירים');
    expect(html).toContain('אחיזה רחבה');
    expect(html).not.toContain('equipment.');
  });

  it('no machine levels → no levels section', async () => {
    store.doc = doc;
    store.catalog = [catalog[0]];
    const html = await mount(<EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="eq1" />);
    expect(html).toContain('data-equipment-v2');
    expect(html).not.toContain('data-equipment-levels');
  });

  it('camera scan flag on: "תרגילים ברמה שלך" open to my level, the rest locked, park workout button', async () => {
    flags.enableEquipmentScanV1 = true;
    useProgressionStore.setState({ domainProgress: { p1: { level: 2 } } } as never);
    store.doc = doc;
    store.catalog = catalog;
    let started = 0;
    const html = await mount(
      <EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="eq1" parkWorkout={{ parkName: 'גינת הרצל', onStart: () => { started++; } }} />,
    );
    expect(html).toContain('תרגילים ברמה שלך');
    expect(html).toContain('רמה 2 · שלך');
    expect(html).toContain('אימון בפארק הזה');
    expect(html).toContain('בונה מכל המתקנים בגינת הרצל, לא רק ממתח');
    expect(html).not.toContain('תרגילים לפי רמה');
    expect(started).toBe(0);
  });

  it('camera scan flag on, no level and no park: beginner state, quiz row, no workout button', async () => {
    useProgressionStore.setState({ domainProgress: {} } as never);
    store.doc = doc;
    store.catalog = catalog;
    const html = await mount(<EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="eq1" />);
    expect(html).toContain('מתאים להתחלה');
    expect(html).toContain('מלאו שאלון כוח קצר');
    expect(html).not.toContain('שלך');
    expect(html).not.toContain('אימון בפארק הזה');
    flags.enableEquipmentScanV1 = false;
  });

  it('flag off → the drawer as today', async () => {
    flags.enablePlaceWorkoutsV1 = false;
    store.doc = doc;
    const html = await mount(<EquipmentDetailDrawer isOpen onClose={() => {}} equipmentId="eq1" />);
    expect(html).not.toContain('data-equipment-v2');
  });
});

describe('equipment v2 — i18n', () => {
  const dirs = [join(__dirname, '..', 'v2'), join(__dirname, '../../../../../content/exercises/client/components/detail-v2')];
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === '__tests__' ? [] : files(p)) : /\.tsx?$/.test(f) ? [p] : [];
  });
  const all = dirs.flatMap(files);
  const text = all.map((f) => readFileSync(f, 'utf8')).join('\n');
  const used = new Set(Array.from(text.matchAll(/'(equipment\.v2\.[A-Za-z.]+)'/g)).map((m) => m[1]));
  const catalogKeys = he as Record<string, string>;

  it('every equipment.v2.* key used exists, none orphaned', () => {
    expect(used.size).toBeGreaterThan(8);
    used.forEach((k) => expect(catalogKeys[k], k).toBeTypeOf('string'));
    expect(Object.keys(catalogKeys).filter((k) => k.startsWith('equipment.v2.') && !used.has(k))).toEqual([]);
  });

  it('no hard-coded Hebrew in the new folders', () => {
    for (const f of all) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(/[֐-׿]/.test(code), f).toBe(false);
    }
  });
});
