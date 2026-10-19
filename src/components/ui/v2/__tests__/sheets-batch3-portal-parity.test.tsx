// @vitest-environment jsdom
/**
 * Sheets batch 3 — flag-OFF parity for the PORTALLED sheet (ExerciseDetailSheet
 * renders only after mount, so it needs a DOM). The legacy markup was recorded
 * from the pre-migration component (committed snapshot) and must stay
 * byte-identical.
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/features/content/exercises/client/components/MasterExerciseView', () => ({
  default: ({ exercise }: { exercise: { id: string } }) => <div data-master-view={exercise.id} />,
}));
vi.mock('@/features/content/exercises/client/store/useExerciseLibraryStore', () => {
  const state = {
    isDetailOpen: false,
    selectedExercise: null,
    closeDetail: () => {},
    detailNotice: null,
    filters: { location: 'park' },
    allPrograms: [],
  };
  return { useExerciseLibraryStore: (sel: (s: typeof state) => unknown) => sel(state) };
});

import ExerciseDetailSheet from '@/features/content/exercises/client/components/ExerciseDetailSheet';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

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
const exercise = { id: 'ex1', name: { he: 'מתח' } } as unknown as Exercise;
const detail = () => mount(<ExerciseDetailSheet controlled={{ exercise, onClose: noop }} />);

describe('flag off — byte-identical to the pre-migration markup (portalled)', () => {
  it('ExerciseDetailSheet', () => {
    expect(detail()).toMatchSnapshot();
  });
});
