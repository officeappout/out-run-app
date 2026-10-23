/**
 * i18n wave 2 batch al (namespace `home`, keys `page.*`): src/app/home/page.tsx.
 *
 * The snapshots below were recorded from the page BEFORE the extraction; the extracted page must render the same
 * Hebrew markup in every state reached here: the two loading screens, the no-profile redirect line, and the full
 * home for v1 / v2 (enable_home_v2), with and without a strength program, male / female, and the v2 greeting at
 * four hours of the day. Rendered with react-dom/server (node env, first render only: no effects run).
 * Zustand stores render their INITIAL state under react-dom/server, so state is written into getInitialState().
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text nodes; not rendered
 * text). What a first render can't reach (toasts, the "checking profile" line, the expanded profile drawer, the
 * intensity pills, the step-goal / past-day cards, the add button's tooltip) is pinned key by key in
 * src/lib/i18n/__tests__/home-page-al-he.test.ts.
 */
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ flags: {} as Record<string, boolean>, loading: false }));

vi.mock('firebase/firestore', async (orig) => {
  const o = await orig<Record<string, unknown>>();
  const ref = () => ({});
  return { ...o, collection: ref, doc: ref, query: ref, where: ref, orderBy: ref, limit: ref, collectionGroup: ref };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {}, functions: {} }));
vi.mock('next/navigation', () => {
  const router = { push() {}, replace() {}, prefetch() {}, back() {} };
  return { useRouter: () => router, useSearchParams: () => new URLSearchParams(), usePathname: () => '/home' };
});
vi.mock('@/hooks/useFeatureFlags', async (orig) => {
  const o = await orig<Record<string, unknown>>();
  return { ...o, useFeatureFlags: () => ({ flags: h.flags, rawFlags: h.flags, loading: h.loading, ready: true }) };
});

import { useUserStore } from '@/features/user';
import { useLocaleStore } from '@/store/useLocaleStore';
import HomePage from '../page';

const USER_DEFAULTS = { ...useUserStore.getInitialState() };
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };
const html = () => renderToStaticMarkup(<HomePage />).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/home-page-al-i18n/${name}.html`;

type Gender = 'male' | 'female';
const profileOf = (gender: Gender, withProgram: boolean, workoutCount?: number) => ({
  id: 'u1',
  core: { name: gender === 'female' ? 'דנה לוי' : 'דוד כהן', gender },
  progression: {
    ...(withProgram ? { domains: { full_body: { currentLevel: 5 } } } : {}),
    ...(workoutCount ? { workoutCount } : {}),
  },
  running: {},
  lifestyle: {},
});

const setCase = (opts: { v2: boolean; hydrated?: boolean; profile?: unknown; gender?: Gender }) => {
  h.flags = { enableHomeV2: opts.v2 };
  Object.assign(useUserStore.getInitialState(), { _hasHydrated: opts.hydrated ?? true, profile: opts.profile ?? null });
  Object.assign(useLocaleStore.getInitialState(), { gender: opts.gender ?? 'other' });
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-21T08:40:00'));
  h.loading = false;
  Object.assign(useUserStore.getInitialState(), USER_DEFAULTS);
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS);
});

it.each([false, true])('loading (not hydrated), v2=%s', async (v2) => {
  setCase({ v2, hydrated: false });
  await expect(html()).toMatchFileSnapshot(snap(`loading-v${v2 ? 2 : 1}`));
});

it('loading (flags still loading), v1', async () => {
  setCase({ v2: false });
  h.loading = true;
  await expect(html()).toMatchFileSnapshot(snap('flags-loading-v1'));
});

it('no profile -> redirect line', async () => {
  setCase({ v2: false });
  await expect(html()).toMatchFileSnapshot(snap('no-profile'));
});

it.each([
  [false, 'male', false],
  [false, 'female', false],
  [false, 'male', true],
  [false, 'female', true],
  [true, 'male', false],
  [true, 'female', false],
  [true, 'male', true],
  [true, 'female', true],
] as const)('home v2=%s gender=%s program=%s', async (v2, gender, withProgram) => {
  setCase({ v2, profile: profileOf(gender, withProgram), gender });
  await expect(html()).toMatchFileSnapshot(
    snap(`home-v${v2 ? 2 : 1}-${gender}-${withProgram ? 'program' : 'noprogram'}`),
  );
});

// v2, no program, already trained (workoutCount > 0): the new-user home shows all widgets -> the health tab with
// the v2 weekly-activity card.
it.each(['male', 'female'] as const)('home v2 trained, no program, gender=%s', async (gender) => {
  setCase({ v2: true, profile: profileOf(gender, false, 3), gender });
  await expect(html()).toMatchFileSnapshot(snap(`home-v2-${gender}-noprogram-trained`));
});

it.each([
  ['06:30', 'morning'],
  ['13:00', 'noon'],
  ['18:15', 'evening'],
  ['23:30', 'night'],
  ['03:00', 'late-night'],
])('v2 greeting at %s', async (time, label) => {
  vi.setSystemTime(new Date(`2026-10-21T${time}:00`));
  setCase({ v2: true, profile: profileOf('male', true), gender: 'male' });
  const out = html();
  const greeting = out.match(/<h1[^>]*>.*?<\/h1>/)?.[0] ?? '';
  expect(greeting).not.toBe('');
  await expect(greeting).toMatchFileSnapshot(snap(`greeting-${label}`));
});
