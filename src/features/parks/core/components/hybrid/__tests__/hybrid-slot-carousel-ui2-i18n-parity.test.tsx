/**
 * i18n extraction batch ui-2 (namespace `map`, `slotCarousel.*`): HybridSlotCarousel copy moves to the catalog.
 * Snapshots recorded from unmodified origin/main (`<!-- -->` stripped). Zustand / hooks render their initial state.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {}, loading: false }) }));
vi.mock('@/hooks/useMapTutorialV1', () => ({ useMapTutorialV1: () => false }));

import HybridSlotCarousel from '../HybridSlotCarousel';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/hybrid-slot-carousel-ui2/${name}.html`;
const noop = () => {};

const preset = { id: 'walk_balanced', aerobicKind: 'walking', emphasis: 'balanced', shape: 'sandwich', bolts: 2, defaultTimeBudgetMin: 30 };
const slots = [
  { id: 'recommended', kind: 'hybrid', title: 'אימון משולב', subtitle: 'הליכה וכוח', bolts: 2, recommended: true, accent: '#00ADEF', preset, timeBudgetMin: 30 },
  { id: 'quick', kind: 'aerobic_quick', title: 'הליכה חופשית', subtitle: 'בלי תכנון', bolts: 1, recommended: false, accent: '#10B981', aerobicKind: 'walking' },
  { id: 'route_stops', kind: 'hybrid', title: 'מסלול + עצירות', subtitle: 'עם תחנות כוח', bolts: 3, recommended: false, accent: '#00ADEF', preset, timeBudgetMin: 45 },
  { id: 'assessment', kind: 'assessment_prompt', title: 'שאלון', subtitle: '', bolts: 1, recommended: false, accent: '#00ADEF' },
] as never;

beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
});

const base = { aerobicKind: 'walking' as const, onActivityChange: noop, onSelectSlot: noop, onBuildYourself: noop };

it('default, all slot kinds', async () => {
  await expect(html(<HybridSlotCarousel {...base} slots={slots} onClose={noop} />)).toMatchFileSnapshot(snap('default'));
});
it('running toggle + computing chip + route stops total', async () => {
  await expect(
    html(<HybridSlotCarousel {...base} aerobicKind="running" slots={slots} computingPreview routeStopsTotal={{ min: 52, calories: 310, stations: 4, includesWalk: true } as never} />),
  ).toMatchFileSnapshot(snap('running-computing-total'));
});
it('route stops total without calories and stations', async () => {
  await expect(
    html(<HybridSlotCarousel {...base} slots={slots} routeStopsTotal={{ min: 1234, calories: null, stations: null, includesWalk: false } as never} />),
  ).toMatchFileSnapshot(snap('total-minutes-only'));
});
it('focused (no activity toggle)', async () => {
  await expect(html(<HybridSlotCarousel {...base} slots={slots} focused />)).toMatchFileSnapshot(snap('focused'));
});
it('loading', async () => {
  await expect(html(<HybridSlotCarousel {...base} slots={[]} loading />)).toMatchFileSnapshot(snap('loading'));
});
