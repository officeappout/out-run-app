/**
 * i18n wave 4 (ltr-host content): Hebrew markup pins for the cards that render INSIDE a `dir="ltr"` / `direction:'ltr'`
 * carousel host and used to carry a hard-coded `dir="rtl"`: ActivityCarousel, HybridSlotCarousel (+ its SlotCard /
 * AssessmentPromptCard / ActivityToggle), ParticipantStrip. Recorded from unmodified main; the converted components
 * (`dir={direction}`, rtl in Hebrew) must produce the same Hebrew DOM. The English direction is pinned in
 * ltr-host-content-en.test.tsx.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: false }, loading: false }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  return { useUserStore: (sel: (s: typeof state) => unknown) => sel(state) };
});
const mapState: Record<string, unknown> = { navCarouselMinimized: false };
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const state = () => ({
    navCardHeight: 0, storyBarHeight: 0, isLapsOpen: false, cameraMode: 'follow', ...mapState,
    setNavCardHeight: noop, setTurnFlyToTarget: noop, setParkTurn: noop, setActiveTurnIdx: noop, setCameraMode: noop, setNavCarouselMinimized: noop,
  });
  const useMapStore = (sel?: (s: Record<string, unknown>) => unknown) => (sel ? sel(state()) : state());
  (useMapStore as unknown as { getState: () => unknown }).getState = state;
  return { useMapStore };
});

import ActivityCarousel from '../ActivityCarousel';
import HybridSlotCarousel from '../hybrid/HybridSlotCarousel';
import TurnCarousel from '../TurnCarousel';
import ParticipantStrip from '@/features/workout-engine/shared/components/ParticipantStrip';
import type { HybridSlot } from '@/features/workout-engine/hybrid/hybrid-slots';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T08:40:00')); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/ltr-host-content/${name}.html`;
const noop = () => {};

const base = { subtitle: 'תת כותרת', bolts: 2 as const, recommended: false, accent: '#00ADEF' };
export const slots = [
  { ...base, id: 'full_park', kind: 'aerobic_quick', aerobicKind: 'walking', title: 'הליכה קלה', recommended: true, reason: 'כי היום יום מנוחה' },
  { ...base, id: 'assess', kind: 'assessment_prompt', title: 'בוא נכיר', bolts: 1 },
  { ...base, id: 'planned', kind: 'planned_run', title: 'תוכנית ריצה', href: '/x' },
] as unknown as HybridSlot[];

describe('ActivityCarousel', () => {
  it('cards + title chip', async () => {
    await expect(html(<ActivityCarousel currentActivity="running" onSelect={noop} onClose={noop} />)).toMatchFileSnapshot(snap('activity-carousel'));
  });
});

describe('HybridSlotCarousel', () => {
  const props = { slots, aerobicKind: 'walking' as const, onActivityChange: noop, onSelectSlot: noop, onBuildYourself: noop };
  it('toggle + close + cards', async () => {
    await expect(html(<HybridSlotCarousel {...props} onClose={noop} />)).toMatchFileSnapshot(snap('hybrid-carousel'));
  });
  it('focused (no toggle)', async () => {
    await expect(html(<HybridSlotCarousel {...props} focused />)).toMatchFileSnapshot(snap('hybrid-carousel-focused'));
  });
  it('loading skeleton', async () => {
    await expect(html(<HybridSlotCarousel {...props} loading />)).toMatchFileSnapshot(snap('hybrid-carousel-loading'));
  });
});

describe('ParticipantStrip', () => {
  const partners = [
    { uid: 'a', name: 'דנה כהן', color: '#f00' },
    { uid: 'b', name: 'יוסי לוי', color: '#0a0', personaImageUrl: 'https://x/y.png' },
  ];
  it('avatars + distance', async () => {
    await expect(html(<ParticipantStrip partnerPositions={partners as never} totalDistanceKm={2.4} />)).toMatchFileSnapshot(snap('participant-strip'));
  });
});

describe('TurnCarousel', () => {
  const turns = [
    { instruction: 'פנה ימינה', distanceMeters: 120, lat: 32.001, lng: 34.801, bearingAfter: 90, pathIndex: 1 },
    { instruction: 'פנה שמאלה', distanceMeters: 300, lat: 32.003, lng: 34.802, bearingAfter: 0, pathIndex: 2 },
  ];
  const path: [number, number][] = [[34.8, 32.0], [34.801, 32.001], [34.802, 32.003], [34.8, 32.0]];
  const el = <TurnCarousel turns={turns} routePath={path} currentLocation={{ lat: 32.0, lng: 34.8 }} />;
  it('expanded cards + minimize pill', async () => {
    mapState.navCarouselMinimized = false;
    await expect(html(el)).toMatchFileSnapshot(snap('turn-carousel'));
  });
  it('minimized pill', async () => {
    mapState.navCarouselMinimized = true;
    await expect(html(el)).toMatchFileSnapshot(snap('turn-carousel-minimized'));
    mapState.navCarouselMinimized = false;
  });
});
