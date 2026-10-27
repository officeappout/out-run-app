/**
 * i18n wave 2 batch ay (namespaces `common` ui.* / `library` favorites.* / `profile` recentActivity.* / `home` / `map`):
 * leftover user-facing components under src/components + small feature widgets.
 *
 * Snapshots recorded BEFORE the extraction (from unmodified main); the extracted components must render the same
 * Hebrew markup in every state reached here. Static markup (react-dom/server, node env). Zustand stores render their
 * INITIAL state under react-dom/server, so state is written into getInitialState(). `<!-- -->` is stripped before
 * comparing (react-dom/server's separator between adjacent text nodes; not rendered text). Text only a click / a
 * throw / a timer reaches (error boundary default UI, link errors, report states, the ErrorBoundary retry) is pinned
 * key by key in src/lib/i18n/__tests__/common-ay-he.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';

const flags = vi.hoisted(() => ({ enableHomeV2: false, enableGenerationReview: true }));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: { enableHomeV2: flags.enableHomeV2, enableGenerationReview: flags.enableGenerationReview } }),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {} }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/lib/auth.service', () => ({ linkWithGoogleAccount: async () => ({}), linkWithAppleAccount: async () => ({}) }));
vi.mock('@/features/user', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  const hook = (sel?: (s: unknown) => unknown) => {
    const s = { profile: null };
    return sel ? sel(s) : s;
  };
  return { ...actual, useUserStore: hook };
});
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: (sel?: (s: unknown) => unknown) => {
    const s = { profile: null };
    return sel ? sel(s) : s;
  },
}));
vi.mock('@/components/ui/v2/Sheet', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return {
    ...actual,
    default: (p: { open: boolean; ariaLabel?: string; title?: ReactNode; children?: ReactNode }) =>
      p.open ? (
        <section data-sheet="" aria-label={p.ariaLabel}>
          {p.title}
          {p.children}
        </section>
      ) : null,
  };
});
vi.mock('@/components/system/report-boundary-error', () => ({ reportBoundaryError() {} }));
vi.mock('@/lib/chunk-reload', () => ({ clearChunkReloadFlag() {}, reloadOnceForChunkError() {} }));
vi.mock('@/lib/sentry-shared', () => ({ isChunkLoadError: (e: { name?: string }) => e?.name === 'ChunkLoadError' }));
vi.mock('@/features/workout-engine/core/store/useSessionStore', () => ({ useSessionStore: { getState: () => ({ clearSession() {} }) } }));
vi.mock('@/features/home/context/HomeV2Context', () => ({ useHomeV2: () => flags.enableHomeV2 }));
vi.mock('@/components/ui/v2/StreakFlame', () => ({ default: () => <i data-flame="" /> }));
vi.mock('@/features/streak-celebration/components/ShieldMark', () => ({ default: () => <i data-shield="" /> }));
vi.mock('@/features/parks/core/components/hybrid/activity-icons', () => ({ ActivityGlyph: () => <i data-glyph="" /> }));
vi.mock('@/features/favorites/hooks/useCachedMedia', () => ({ useCachedMediaUrl: () => null }));
vi.mock('@/features/favorites/services/favorites.service', () => ({}));
vi.mock('@/features/favorites/services/favorites-db', () => ({}));
vi.mock('@/features/favorites/services/media-downloader', () => ({}));

import BrandedSplashScreen from '@/components/BrandedSplashScreen';
import ExistingAccountModal from '@/components/ExistingAccountModal';
import LinkAccountPrompt from '@/components/LinkAccountPrompt';
import { compactWidgetFallback } from '../CompactWidgetFallback';
import LiveSessionErrorFallback from '../LiveSessionErrorFallback';
import RouteErrorFallback from '../RouteErrorFallback';
import PushForegroundToast from '../PushForegroundToast';
import ClassicFormSheet from '@/components/ui/ClassicFormSheet';
import CartProgressIcon from '@/components/ui/v2/CartProgressIcon';
import { DoneCheck } from '@/components/ui/v2/DoneRow';
import ImprovementCard from '@/components/ui/v2/ImprovementCard';
import JourneyStrip from '@/components/ui/v2/JourneyStrip';
import LineChart from '@/components/ui/v2/LineChart';
import ScreenSkeleton from '@/components/ui/v2/ScreenSkeleton';
import { SheetHeader } from '@/components/ui/v2/Sheet';
import StepBar from '@/components/ui/v2/StepBar';
import DraggableSheet from '@/components/ui/v2/DraggableSheet';
import FavoritesTab from '@/features/favorites/components/FavoritesTab';
import { useFavoritesStore } from '@/features/favorites/store/useFavoritesStore';
import ReportProblemButton from '@/features/generation-review/components/ReportProblemButton';
import ReportProblemSheet from '@/features/generation-review/components/ReportProblemSheet';
import RecentActivityList from '@/features/profile/components/widgets/RecentActivityList';
import CelebrationHero from '@/features/streak-celebration/components/CelebrationHero';
import WeatherChip from '@/features/weather/components/WeatherChip';
import { usePushToastStore } from '@/lib/native/usePushToastStore';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/ay-i18n/${name}.html`;
const noop = () => {};
const cart = [{ color: '#0af', done: true }, { color: '#0af', done: true }, { color: '#fa0', done: false }];

beforeEach(() => {
  flags.enableHomeV2 = false;
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
});

describe('components', () => {
  it('splash + skeleton', async () => {
    await expect(html(<><BrandedSplashScreen /><ScreenSkeleton /></>)).toMatchFileSnapshot(snap('splash-skeleton'));
  });

  it.each([false, true])('existing account modal, v2=%s', async (v2) => {
    flags.enableHomeV2 = v2;
    const out = [
      html(<ExistingAccountModal provider="google" loading={false} onConfirm={noop} onCancel={noop} />),
      html(<ExistingAccountModal provider="apple" loading onConfirm={noop} onCancel={noop} />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap(`existing-account-v${v2 ? 2 : 1}`));
  });

  it('link account prompt', async () => {
    const out = [
      html(<LinkAccountPrompt isOpen onClose={noop} onLinked={noop} />),
      html(<LinkAccountPrompt isOpen onClose={noop} onLinked={noop} message="הודעה מותאמת" />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap('link-account'));
  });

  it('error fallbacks', async () => {
    const err = Object.assign(new Error('x'), {});
    const chunk = Object.assign(new Error('x'), { name: 'ChunkLoadError' });
    const out = [
      html(compactWidgetFallback(noop)),
      html(<LiveSessionErrorFallback error={err} reset={noop} boundary="t" />),
      html(<LiveSessionErrorFallback error={err} reset={noop} boundary="t" kind="run" />),
      html(<RouteErrorFallback error={err} reset={noop} boundary="t" />),
      html(<RouteErrorFallback error={err} reset={noop} boundary="t" title="כותרת" description="תיאור" retryLabel="נסה" />),
      html(<RouteErrorFallback error={chunk} reset={noop} boundary="t" />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap('error-fallbacks'));
  });

  it('push toast region', async () => {
    const empty = html(<PushForegroundToast />);
    Object.assign(usePushToastStore.getInitialState(), {
      queue: [{ id: 'a', title: 'כותרת', body: 'גוף', channel: 'system' }],
    });
    const one = html(<PushForegroundToast />);
    await expect(`${empty}\n${one}`).toMatchFileSnapshot(snap('push-toast'));
  });

  it('classic form sheet + v2 primitives', async () => {
    const out = [
      html(<ClassicFormSheet {...({ isOpen: true, onClose: noop, title: 'כותרת' } as never)}><p>x</p></ClassicFormSheet>),
      html(<CartProgressIcon items={cart} />),
      html(<CartProgressIcon items={cart} ariaLabel="מותאם" />),
      html(<DoneCheck />),
      html(<SheetHeader title="כותרת" onClose={noop} />),
      html(<SheetHeader title="כותרת" onClose={noop} closeLabel="סגור" />),
      html(<StepBar current={2} />),
      html(<LineChart data={[{ key: 'a', value: 1 }, { key: 'b', value: 3 }, { key: 'c', value: 2 }] as never} goal={2} />),
      html(<LineChart data={[{ key: 'a', value: 1 }, { key: 'b', value: 3 }] as never} ariaLabel="גרף שלי" goal={2} goalLabel="מטרה" />),
      html(<DraggableSheet {...({ open: true, onClose: noop, snapPoints: [200, 500], initialSnap: 0 } as never)}><p>x</p></DraggableSheet>),
      html(<DraggableSheet {...({ open: true, onClose: noop, snapPoints: [200, 500], initialSnap: 1 } as never)}><p>x</p></DraggableSheet>),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap('v2-primitives'));
  });

  it('improvement card + journey strip', async () => {
    const item = (n: number) => ({ key: `k${n}`, name: `תרגיל ${n}`, imageUrl: null, previous: '10', today: '12', delta: 2, unit: 'חזרות' });
    const out = [
      html(<ImprovementCard items={[item(1)] as never} />),
      html(<ImprovementCard items={[item(1), item(2)] as never} />),
      html(<ImprovementCard items={[item(1), item(2)] as never} context="הקשר" />),
      html(<JourneyStrip items={[{ key: 'r', kind: 'repeat', subtype: 'running', label: '6 × 400 מ׳' }]} />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap('improvement-journey'));
  });
});

describe('features', () => {
  const fav = (id: string, difficulty: 1 | 2 | 3) => ({
    id, title: `אימון ${id}`, description: '', difficulty, estimatedDuration: 25, exerciseCount: 6, totalPlannedSets: 12,
    isRecovery: false, structure: 'x', exercises: [], equipment: [], muscles: [], isDownloaded: false, savedAt: new Date('2026-10-01'),
  });
  const setFavs = (state: Record<string, unknown>) => Object.assign(useFavoritesStore.getInitialState(), state);

  it.each([false, true])('favorites tab, v2=%s', async (v2) => {
    const states = [
      { isLoading: true, favorites: new Map(), downloadedIds: new Set() },
      { isLoading: false, favorites: new Map(), downloadedIds: new Set() },
      {
        isLoading: false,
        favorites: new Map([['a', fav('a', 1)], ['b', fav('b', 2)], ['c', fav('c', 3)]]),
        downloadedIds: new Set(['b']),
      },
    ];
    const out = states.map((s) => {
      setFavs(s);
      return html(<FavoritesTab onSelectWorkout={noop} v2={v2} />);
    });
    await expect(out.join('\n')).toMatchFileSnapshot(snap(`favorites-v${v2 ? 2 : 1}`));
  });

  it('report problem', async () => {
    const out = [html(<ReportProblemButton types={[]} />), html(<ReportProblemSheet open onClose={noop} types={[]} />)].join('\n');
    flags.enableGenerationReview = false;
    const off = html(<ReportProblemButton types={[]} />);
    flags.enableGenerationReview = true;
    await expect(`${out}\n${off}`).toMatchFileSnapshot(snap('report-problem'));
  });

  it.each(['male', 'female', 'other'] as const)('recent activity, %s', async (gender) => {
    Object.assign(useLocaleStore.getInitialState(), { gender });
    const mk = (type: string, i: number) => ({ id: `w${i}`, workoutType: type, xpEarned: 10 + i, date: new Date('2026-10-0' + (i + 1)) });
    const out = [
      html(<RecentActivityList workouts={[]} isLoading={false} />),
      html(<RecentActivityList workouts={[]} isLoading />),
      html(<RecentActivityList workouts={['strength', 'walking', 'cycling', 'recovery', 'running'].map(mk) as never} isLoading={false} />),
    ].join('\n');
    await expect(out).toMatchFileSnapshot(snap(`recent-activity-${gender}`));
  });

  it('streak hero milestone + weather chip', async () => {
    const hero = html(<CelebrationHero c={{ variant: 'milestone', streak: 7 } as never} tones={[]} unit="ימים" />);
    const mk = (label: string | null) => ({
      temperatureC: 28.4, weatherCode: 1, isNight: false, classification: { flag: label ? 'heat' : 'none', label }, snapshot: { source: 'x' },
    });
    const out = [hero, html(<WeatherChip weather={mk('חם — כדאי להקדים') as never} />), html(<WeatherChip weather={mk(null) as never} />)].join('\n');
    await expect(out).toMatchFileSnapshot(snap('hero-weather'));
  });
});
