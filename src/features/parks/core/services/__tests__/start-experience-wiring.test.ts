import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression guard for the "start experience" state map's wiring into all
 * THREE live start entry points (discover CTA, hybrid/route-detail sheet,
 * FreeRun's own carousel) plus the real-walk-duration fix and the cheap
 * radius ring — split PR-1 of the 11.10.2026 build.
 *
 * Source-level, not a render test — no jsdom/component harness in this
 * repo (vitest.config.ts: "node" env only, .tsx files are not transformed).
 * These assert the actual wired substrings so a later refactor that
 * silently drops one entry point's gate (or reintroduces a literal
 * `disabled` attribute, which swallows the tap with no feedback) fails
 * loudly here instead of being discovered in the field again.
 */

function read(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');
}

describe('useWalkToRoute.ts — real Mapbox duration, not the distance/80 guess', () => {
  const src = read('../../hooks/useWalkToRoute.ts');

  it('exports ARRIVAL_RADIUS_M for start-experience-state.ts to re-export', () => {
    expect(src).toMatch(/export const ARRIVAL_RADIUS_M/);
  });

  it('computes walkMinutes from the real fetched duration, not distance/80', () => {
    expect(src).toContain('const walkMinutes = Math.max(1, Math.round(result.duration / 60));');
    expect(src).not.toContain('Math.round(result.distance / 80)');
  });
});

describe('RouteCardUnified.tsx — shared blocked-CTA affordance (3 carousels reuse this)', () => {
  const src = read('../../components/RouteCardUnified.tsx');

  it('accepts ctaBlockedReason + onCtaBlocked, both optional (byte-identical for callers that omit them)', () => {
    expect(src).toContain('ctaBlockedReason?: string | null;');
    expect(src).toContain('onCtaBlocked?: (reason: string) => void;');
    expect(src).toContain('ctaBlockedReason = null,');
  });

  it('routes the click to onCtaBlocked instead of onCta when blocked', () => {
    const match = src.match(/const handleCta = \(e: React\.MouseEvent\) => \{([\s\S]*?)\n {2}\};/);
    expect(match, 'handleCta not found — signature changed?').toBeTruthy();
    expect(match![1]).toContain('if (ctaBlockedReason) {');
    expect(match![1]).toContain('onCtaBlocked?.(ctaBlockedReason);');
    expect(match![1]).toContain('return;');
  });

  it('uses aria-disabled, NEVER the literal disabled attribute (which would swallow the tap with no feedback)', () => {
    expect(src).toContain('aria-disabled={!!ctaBlockedReason}');
    // Excludes "aria-disabled={" (preceded by "-") — only flags a BARE `disabled={`.
    expect(src).not.toMatch(/[^-]disabled=\{/);
  });
});

describe('BottomJourneyContainer.tsx — discover-mode CTA entry point', () => {
  const src = read('../../components/BottomJourneyContainer.tsx');

  it('imports the shared state-map function and the non-focused-card estimate fallback', () => {
    expect(src).toContain(
      "import { computeStartExperienceState, estimateWalkMinutesFromKm } from '../services/start-experience-state';",
    );
  });

  it('accepts userPosition as an optional prop defaulting to null (fails open if the caller omits it)', () => {
    expect(src).toContain('userPosition?: { lat: number; lng: number } | null;');
    expect(src).toContain('userPosition = null,');
  });

  it('computes startState per-card and wires ctaBlockedReason/onCtaBlocked to the toast', () => {
    expect(src).toContain('computeStartExperienceState(userPosition, route.path, cardWalkMinutes)');
    expect(src).toContain('ctaBlockedReason={blockedReason}');
    expect(src).toContain("onCtaBlocked={(reason) => showToast('error', reason)}");
  });
});

describe('RouteDetailSheet.tsx — single-route hybrid/discover detail sheet', () => {
  const src = read('../../../client/components/route-preview/RouteDetailSheet.tsx');

  it('imports the shared state-map function', () => {
    expect(src).toContain(
      "import { computeStartExperienceState } from '@/features/parks/core/services/start-experience-state';",
    );
  });

  it('derives isTooFarToStart from the shared state map, not a local re-implementation', () => {
    expect(src).toContain(
      'const startState = computeStartExperienceState(userLocation ?? null, route?.path ?? null, walkToRouteMinutes);',
    );
    expect(src).toContain("const isTooFarToStart = startState === 'off_route_too_far';");
  });

  it('the Start button shows a toast and returns early when blocked, and uses aria-disabled not disabled', () => {
    expect(src).toContain('if (isTooFarToStart) {');
    expect(src).toContain('aria-disabled={isTooFarToStart}');
  });
});

describe('RouteCarousel.tsx — FreeRun entry point (ALL THREE entry points requirement)', () => {
  const src = read('../../components/RouteCarousel.tsx');

  it('threads userPosition from RouteCarousel -> CardsState -> RouteCard (3-level prop chain)', () => {
    // RouteCarousel -> CardsState
    expect(src).toContain('userPosition={userPosition}\n            onSelect={onSelect}');
    // CardsState's own prop declaration
    expect(src).toMatch(/userPosition: \{ lat: number; lng: number \};/);
    // CardsState -> RouteCard (inside the .map())
    expect(src).toContain('userPosition={userPosition}\n              onStart={() => onSelect(route)}');
  });

  it('RouteCard computes startState from the shared function and estimates walk-minutes via haversineKm (no per-card Mapbox fetch)', () => {
    expect(src).toContain("import { haversineKm } from '../services/geoUtils';");
    expect(src).toContain(
      "import { computeStartExperienceState, estimateWalkMinutesFromKm } from '../services/start-experience-state';",
    );
    expect(src).toContain('const startState = computeStartExperienceState(userPosition, route.path, cardWalkMinutes);');
  });

  it('only the UNIFIED_ROUTE_CARDS_ENABLED branch wires ctaBlockedReason — the legacy branch stays byte-identical', () => {
    const unifiedBranch = src.match(/if \(UNIFIED_ROUTE_CARDS_ENABLED\) \{([\s\S]*?)\n {2}\}\n\n {2}return \(/);
    expect(unifiedBranch, 'UNIFIED_ROUTE_CARDS_ENABLED branch not found').toBeTruthy();
    expect(unifiedBranch![1]).toContain('ctaBlockedReason={blockedReason}');
    expect(unifiedBranch![1]).toContain("onCtaBlocked={(reason) => showToast('error', reason)}");
  });
});

describe('DiscoverLayer.tsx — userPosition threaded into BottomJourneyContainer', () => {
  const src = read('../../../../../app/map/layers/DiscoverLayer.tsx');

  it('passes userPosition (from the existing userLocation var) into the BottomJourneyContainer call', () => {
    const match = src.match(/<BottomJourneyContainer([\s\S]*?)\/>/);
    expect(match, 'BottomJourneyContainer call site not found').toBeTruthy();
    expect(match![1]).toContain('userPosition={userLocation}');
  });
});

describe('AppMap.tsx — cheap fixed-pixel start-experience radius ring (v1.1)', () => {
  const src = read('../../components/AppMap.tsx');

  it('defines START_RADIUS_RING_LAYER as a circle layer (pixel radius, not geo-accurate)', () => {
    const match = src.match(/const START_RADIUS_RING_LAYER: mapboxgl\.CircleLayer = \{([\s\S]*?)\n\};/);
    expect(match, 'START_RADIUS_RING_LAYER not found').toBeTruthy();
    expect(match![1]).toContain("type: 'circle'");
    expect(match![1]).toContain("source: 'start-radius-ring'");
  });

  it('only renders when startRadiusRingGeoJSON is non-null (fails open — no ring, no crash, on bad/missing data)', () => {
    const match = src.match(/\{startRadiusRingGeoJSON && \(([\s\S]*?)\n {8}\)\}/);
    expect(match, 'guarded radius-ring block not found').toBeTruthy();
    expect(match![1]).toContain('id="start-radius-ring"');
    expect(match![1]).toContain('<Layer {...START_RADIUS_RING_LAYER} />');
  });

  it('startRadiusRingGeoJSON itself fails open to null on a non-finite currentLocation (12.10.2026 memoization fix)', () => {
    const match = src.match(/const startRadiusRingGeoJSON = useMemo\(\(\) => \{([\s\S]*?)\n {2}\}, \[/);
    expect(match, 'startRadiusRingGeoJSON memo not found').toBeTruthy();
    expect(match![1]).toContain('if (!isFiniteLatLng(currentLocation)) return null;');
  });

  it('startRadiusRingGeoJSON is keyed on coordinates rounded to 4 decimal degrees — removes the per-GPS-tick setData() churn without changing the rendered position meaningfully', () => {
    const match = src.match(/const startRadiusRingGeoJSON = useMemo\(\(\) => \{[\s\S]*?\n {2}\}, \[([\s\S]*?)\]\);/);
    expect(match, 'startRadiusRingGeoJSON memo dependency array not found').toBeTruthy();
    expect(match![1]).toContain('Math.round(currentLocation.lng * 10_000)');
    expect(match![1]).toContain('Math.round(currentLocation.lat * 10_000)');
  });
});
