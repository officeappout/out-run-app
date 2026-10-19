// @vitest-environment jsdom
/**
 * Sheets batch 4 — flag-OFF parity for the PORTALLED sheet
 * (EquipmentDetailDrawer renders only after mount, so it needs a DOM). The
 * legacy markup was recorded from the pre-migration component (committed
 * snapshot) and must stay byte-identical.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const flags = { enableHomeV2: false };
const profile = { id: 'u1', core: { isSuperAdmin: false } };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: { profile: typeof profile }) => unknown) => (sel ? sel({ profile }) : { profile }),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
// Pending fetch → the drawer shows its loading state (deterministic).
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({
  getGymEquipment: () => new Promise(() => {}),
}));
vi.mock('@/features/content/programs/core/program.service', () => ({ getAllPrograms: async () => [] }));
vi.mock('@/lib/bunny/BunnyVideoPlayer', () => ({ default: () => <div data-bunny /> }));

import EquipmentDetailDrawer from '@/features/parks/client/components/equipment-detail/EquipmentDetailDrawer';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(el: React.ReactElement): string {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  return Array.from(document.body.children)
    .filter((n) => n !== host)
    .map((n) => n.outerHTML)
    .join('');
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  document.documentElement.removeAttribute('style');
  root = null;
  host = null;
  flags.enableHomeV2 = false;
});

const noop = () => {};
const drawer = () => mount(<EquipmentDetailDrawer isOpen onClose={noop} equipmentId="eq1" />);

describe('flag off — byte-identical to the pre-migration markup (portalled)', () => {
  it('EquipmentDetailDrawer', () => {
    expect(drawer()).toMatchSnapshot();
  });
});

describe('flag on — the shared <Sheet>', () => {
  it('EquipmentDetailDrawer: portalled, z 200/201, 90vh, whole-panel drag, IconButton close', () => {
    flags.enableHomeV2 = true;
    const out = drawer();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index: 201');
    expect(out).toContain('z-index: 200');
    expect(out).toContain('max-h-[90vh]');
    expect(out).toContain('animate-spin');
    expect(out).toContain('data-v2-icon-button="white-ring"');
  });
});
