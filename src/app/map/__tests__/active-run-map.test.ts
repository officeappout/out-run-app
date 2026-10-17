import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Active-run-map fix (17.10.2026) — source-level guards (no jsdom harness in
 * this repo; vitest runs in "node" env and doesn't render .tsx).
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('FreeRunLayer publishes laps-open so map-root chrome hides over the laps list', () => {
  const src = read('../layers/FreeRunLayer.tsx');
  it('drives useMapStore.isLapsOpen from the shell drag state', () => {
    expect(src).toContain('<LapsOpenPublisher open={isWorkoutActive && (isMinimized || isDragging)} />');
    expect(src).toContain('setIsLapsOpen(open);');
  });
  it('group badge no longer sits at a fixed 68 px under the turn card', () => {
    expect(src).toContain('style={{ top: groupBadgeTop }}');
    expect(src).toContain('${storyBarH + navCardH + 64}px');
  });
});

describe('TwoLayerShell exposes isDragging', () => {
  const src = read('../../../features/workout-engine/shared/components/TwoLayerShell.tsx');
  it('sets it on drag start and clears it on drag end', () => {
    expect(src).toContain('onDragStart={isActive ? () => setIsDragging(true) : undefined}');
    expect(src).toContain('setIsDragging(false); handleDragEnd(e, info);');
    expect(src).toContain('children({ dragControls, isMinimized, onExpand, isDragging })');
  });
});

describe('TurnCarousel — v2 combined banner is flag-gated', () => {
  const src = read('../../../features/parks/core/components/TurnCarousel.tsx');
  it('reads enable_home_v2 and only swaps the THIN card when on', () => {
    expect(src).toContain('const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;');
    expect(src).toContain('if (v2) {');
    expect(src).toContain('<NavBannerV2');
  });
  it('proximity keeps the legacy FULL carousel when v2 is off', () => {
    expect(src).toContain("proximityExpand      ? (v2 ? 'thin' : 'full')");
  });
});
