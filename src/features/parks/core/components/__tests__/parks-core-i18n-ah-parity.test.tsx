/**
 * i18n wave 2 batch ah (namespace `map`; keys caloriesChip.* / mapLoading.* / routeLoader.* / workoutPrefs.*):
 * CaloriesChip, MapLoadingSkeleton, RouteGenerationLoader, WorkoutPreferencesModal.
 *
 * Snapshots recorded from the components BEFORE the extraction; the extracted components must render the same
 * Hebrew markup. `<!-- -->` is stripped before comparing (in the BEFORE snapshots too): react-dom/server inserts
 * it between adjacent text nodes (`{n} קלוריות` is two nodes, `t('…', { n })` is one) — it is not rendered text.
 * The loader's later steps (timer) and the modal's tap states are pinned key by key in
 * src/lib/i18n/__tests__/map-parks-core-he.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const nudge = { needsWeight: false };
const user: { weight: number | undefined } = { weight: 70 };

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('@/components/ui/WeightInlineRow', () => ({ useWeightNudge: () => ({ needsWeight: nudge.needsWeight }) }));
vi.mock('@/features/user', () => {
  const useUserStore = (sel: (s: unknown) => unknown) =>
    sel({ profile: { core: { gender: 'male', weight: user.weight } } });
  return { useUserStore };
});

import CaloriesChip from '../CaloriesChip';
import MapLoadingSkeleton from '../MapLoadingSkeleton';
import RouteGenerationLoader from '../RouteGenerationLoader';
import WorkoutPreferencesModal from '../WorkoutPreferencesModal';

beforeEach(() => { nudge.needsWeight = false; user.weight = 70; });

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/parks-core-i18n-ah/${name}.html`;
const noop = () => {};

describe('CaloriesChip', () => {
  it('plain, weight known', async () => {
    await expect(html(<CaloriesChip calories={312.4} weightDependent onEditWeight={noop} />)).toMatchFileSnapshot(snap('chip-plain'));
  });
  it('nudge shown (weight unset)', async () => {
    nudge.needsWeight = true;
    await expect(html(<CaloriesChip calories={312.6} weightDependent onEditWeight={noop} />)).toMatchFileSnapshot(snap('chip-nudge'));
  });
  it('nudge needs weightDependent + handler', async () => {
    nudge.needsWeight = true;
    await expect(html(<CaloriesChip calories={0} />)).toMatchFileSnapshot(snap('chip-no-nudge'));
  });
  it('1000+ calories (no thousands separator)', async () => {
    await expect(html(<CaloriesChip calories={1234.2} />)).toMatchFileSnapshot(snap('chip-thousand'));
  });
});

describe('MapLoadingSkeleton', () => {
  it('visible / hidden', async () => {
    await expect(html(<MapLoadingSkeleton visible />)).toMatchFileSnapshot(snap('skeleton-visible'));
    await expect(html(<MapLoadingSkeleton visible={false} />)).toMatchFileSnapshot(snap('skeleton-hidden'));
  });
});

describe('RouteGenerationLoader', () => {
  it('first step', async () => {
    await expect(html(<RouteGenerationLoader />)).toMatchFileSnapshot(snap('loader-first'));
  });
});

describe('WorkoutPreferencesModal', () => {
  it('closed', async () => {
    await expect(html(<WorkoutPreferencesModal isOpen={false} onClose={noop} onUpdate={noop} />)).toMatchFileSnapshot(snap('prefs-closed'));
  });
  it.each([70, undefined])('open, weight=%s', async (w) => {
    user.weight = w;
    await expect(html(<WorkoutPreferencesModal isOpen onClose={noop} onUpdate={noop} />)).toMatchFileSnapshot(snap(`prefs-open-${w ?? 'noweight'}`));
  });
});
