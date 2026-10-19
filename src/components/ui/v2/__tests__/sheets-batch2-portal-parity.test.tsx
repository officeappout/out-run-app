// @vitest-environment jsdom
/**
 * Sheets batch 2 — flag-OFF parity for the PORTALLED sheets (they render only
 * after mount, so they need a DOM). The legacy markup was recorded from the
 * pre-migration components (committed snapshot) and must stay byte-identical.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const flags = { enableHomeV2: false };
const profile = {
  id: 'u1',
  core: { isSuperAdmin: false },
  progression: {
    tracks: { push: { currentLevel: 4, percent: 37, maxLevel: 10 } },
    domains: {},
    skillFocusIds: [],
  },
};

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: { profile: typeof profile }) => unknown) => (sel ? sel({ profile }) : { profile }),
}));
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: (sel?: (s: { profile: typeof profile }) => unknown) => (sel ? sel({ profile }) : { profile }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/features/content/programs', () => ({
  getProgramIcon: (key?: string) => <i data-icon={key ?? ''} />,
  resolveProgramLabel: (slug: string) => `label:${slug}`,
}));
vi.mock('@/features/content/programs/core/program.service', () => ({
  getProgramByTemplateId: () => new Promise(() => {}),
  getAllPrograms: async () => [],
}));
vi.mock('@/features/user/onboarding/services/mini-domain-assessment', () => ({ startMiniDomainAssessment: () => {} }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/lib/progression-map-config', () => ({ resolveProgressionMapDestination: () => null }));

import ParentProgramSheet from '@/features/profile/components/widgets/ParentProgramSheet';
import { BoardSheet } from '@/features/arena/components/LeagueBoardSheets';

// framer-motion reads matchMedia for reduced motion.
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
  // The portal target is document.body; drop the (empty) host from the dump.
  return Array.from(document.body.children)
    .filter((n) => n !== host)
    .map((n) => n.outerHTML)
    .join('');
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null;
  host = null;
  flags.enableHomeV2 = false;
});

const noop = () => {};

describe('flag off — byte-identical to the pre-migration markup (portalled)', () => {
  it('ParentProgramSheet', () => {
    expect(mount(<ParentProgramSheet parentId="upper_body" onClose={noop} />)).toMatchSnapshot();
  });
  it('BoardSheet', () => {
    expect(mount(<BoardSheet isOpen onClose={noop} title="איך צוברים נקודות"><p>גוף</p></BoardSheet>)).toMatchSnapshot();
  });
});

describe('flag on — the shared <Sheet>', () => {
  it('ParentProgramSheet: z 60/61, close via IconButton', () => {
    flags.enableHomeV2 = true;
    const out = mount(<ParentProgramSheet parentId="upper_body" onClose={noop} v2 />);
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index: 61');
    expect(out).toContain('z-index: 60');
    expect(out).toContain('data-v2-icon-button="surface"');
    expect(out).toContain('label:upper_body');
  });
  it('BoardSheet: z 100/101, width-capped, title + IconButton', () => {
    flags.enableHomeV2 = true;
    const out = mount(<BoardSheet isOpen onClose={noop} title="איך צוברים נקודות"><p>גוף</p></BoardSheet>);
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index: 101');
    expect(out).toContain('mx-auto max-w-md');
    expect(out).toContain('aria-label="איך צוברים נקודות"');
    expect(out).toContain('data-v2-icon-button="surface"');
    expect(out).toContain('<p>גוף</p>');
  });
  it('BoardSheet: Escape closes (Sheet closeOnEscape)', () => {
    flags.enableHomeV2 = true;
    let closed = 0;
    mount(<BoardSheet isOpen onClose={() => { closed += 1; }} title="t"><p>b</p></BoardSheet>);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(closed).toBe(1);
  });
});
