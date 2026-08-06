import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression guard for "health-declaration popup covered by a still-open
 * hybrid card" — the same missing-dismiss-before-JIT pattern already fixed
 * once in RouteDetailSheet.tsx:1082, found in two MORE places feeding the
 * same JITSetupModal (z-[90]) via logic.startActiveWorkout:
 *   A) HybridOverviewScreen's onStart ("הליכה + כוח" / "אימון מלא בפארק" —
 *      both `kind: 'hybrid'` slots, same overview screen, same handler)
 *   B) handleSelectSlot's aerobic_quick branch ("הליכה חופשית" / "ריצה חופשית")
 * Source-level, not a render test — no jsdom/component harness in this repo
 * (vitest.config.ts: "node" env only).
 */

const discoverLayerPath = fileURLToPath(new URL('../DiscoverLayer.tsx', import.meta.url));
const src = readFileSync(discoverLayerPath, 'utf8');

describe('DiscoverLayer — hybrid flow dismissed before the JIT-gated start (Location A: HybridOverviewScreen onStart)', () => {
  const match = src.match(/onStart=\{\(\) => \{([\s\S]*?)\n {16}\}\}/);

  it('finds the onStart handler', () => {
    expect(match, 'onStart handler not found — HybridOverviewScreen wiring changed').toBeTruthy();
  });

  it('captures the composed plan BEFORE resetting hybrid state', () => {
    const body = match![1];
    expect(body.indexOf('const c = hybridComposed')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('const c = hybridComposed')).toBeLessThan(body.indexOf('resetHybridFlow()'));
  });

  it('dismisses the overview (resetHybridFlow + setMapMode) BEFORE runHybridPlan starts the JIT-gated workout', () => {
    const body = match![1];
    expect(body).toContain('resetHybridFlow()');
    expect(body).toContain("setMapMode('idle')");
    expect(body).toContain('runHybridPlan(c, logic.startActiveWorkout)');
    const resetIdx = body.indexOf('resetHybridFlow()');
    const mapIdx = body.indexOf("setMapMode('idle')");
    const runIdx = body.indexOf('runHybridPlan(c, logic.startActiveWorkout)');
    expect(resetIdx).toBeLessThan(runIdx);
    expect(mapIdx).toBeLessThan(runIdx);
  });
});

describe('DiscoverLayer — hybrid flow dismissed before the JIT-gated start (Location B: handleSelectSlot aerobic_quick branch)', () => {
  const match = src.match(/\/\/ Aerobic quick-start[\s\S]*?\n {2}\}, \[composeAndShowOverview[^\]]*\]\);/);

  it('finds the aerobic_quick branch', () => {
    expect(match, 'aerobic_quick branch not found — handleSelectSlot structure changed').toBeTruthy();
  });

  it('dismisses the slot carousel (resetHybridFlow + setMapMode) BEFORE startActiveWorkout', () => {
    const body = match![0];
    expect(body).toContain('resetHybridFlow()');
    expect(body).toContain("setMapMode('idle')");
    expect(body).toContain('logic.startActiveWorkout()');
    const resetIdx = body.indexOf('resetHybridFlow()');
    const mapIdx = body.indexOf("setMapMode('idle')");
    const startIdx = body.indexOf('logic.startActiveWorkout()');
    expect(resetIdx).toBeLessThan(startIdx);
    expect(mapIdx).toBeLessThan(startIdx);
  });

  it('includes resetHybridFlow in the useCallback dependency array', () => {
    expect(match![0]).toMatch(/\}, \[composeAndShowOverview[^\]]*resetHybridFlow[^\]]*\]/);
  });
});
