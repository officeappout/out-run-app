/**
 * i18n wave 2 batch ar (namespace `map`; keys mapLayers.*): the destination card (NavigateLayer) and the route-builder
 * layer. Snapshots recorded BEFORE the extraction; the extracted layers must render the same Hebrew markup.
 * The builder's route-picker card opens after the preferences modal (state) — its copy is pinned key by key in
 * src/lib/i18n/__tests__/map-batch-ar-he.test.ts. Static markup, node env; `<!-- -->` stripped before comparing.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('@/features/parks/core/context/MapModeContext', () => ({ useMapMode: () => ({ setMode: () => {} }) }));
vi.mock('@/features/parks/core/hooks/useSuppressBottomNav', () => ({ useSuppressBottomNav: () => {} }));
vi.mock('@/features/parks', () => ({ useMapLogic: () => ({}) }));
vi.mock('@/features/parks/core/components/WorkoutPreferencesModal', () => ({ default: () => <div data-prefs-modal /> }));

import NavigateLayer from '../NavigateLayer';
import BuilderLayer from '../BuilderLayer';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/map-layers-i18n/${name}.html`;
const route = (distance: number, duration: number) => ({ id: `r${distance}`, distance, duration });

describe('NavigateLayer', () => {
  it('with address and routes', async () => {
    const logic = {
      selectedAddress: { text: 'דיזנגוף 10' },
      navigationRoutes: { walking: route(2.4, 30), running: route(2.4, 14), cycling: undefined },
      selectedNavActivity: 'walking',
    };
    await expect(html(<NavigateLayer logic={logic as never} />)).toMatchFileSnapshot(snap('navigate-routes'));
  });
  it('no address, no routes', async () => {
    const logic = { selectedAddress: null, navigationRoutes: {}, selectedNavActivity: 'running' };
    await expect(html(<NavigateLayer logic={logic as never} />)).toMatchFileSnapshot(snap('navigate-empty'));
  });
});

describe('BuilderLayer', () => {
  it('opens on the preferences modal', async () => {
    await expect(html(<BuilderLayer logic={{} as never} />)).toMatchFileSnapshot(snap('builder-prefs'));
  });
});
