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
 *
 * Also guards the FOLLOW-UP bug (10.08.2026 diagnosis): resetHybridFlow's
 * default `logic.setFocusedRoute(null)` — correct when the user is actually
 * LEAVING the flow — silently discarded the route AppMap needs to draw the
 * active-run path (FreeRunLayer → AppMap's `focusedRoute` prop, gated on
 * `focusedRoute?.id === 'hybrid-route'`) when called from a START path
 * instead. Location A now passes `{ keepFocusedRoute: true }`; Location B
 * does NOT need it (aerobic_quick already nulls focusedRoute itself one line
 * earlier — a real free run legitimately has no guided route to preserve).
 *
 * Source-level, not a render test — no jsdom/component harness in this repo
 * (vitest.config.ts: "node" env only).
 */

const discoverLayerPath = fileURLToPath(new URL('../DiscoverLayer.tsx', import.meta.url));
const src = readFileSync(discoverLayerPath, 'utf8');

describe('DiscoverLayer — resetHybridFlow keepFocusedRoute option', () => {
  const match = src.match(/const resetHybridFlow = useCallback\(\(([\s\S]*?)\n {2}\}, \[logic\]\);/);

  it('finds the resetHybridFlow definition', () => {
    expect(match, 'resetHybridFlow definition not found — signature changed?').toBeTruthy();
  });

  it('accepts an opts.keepFocusedRoute parameter', () => {
    expect(match![1]).toContain('opts?: { keepFocusedRoute?: boolean }');
  });

  it('only nulls focusedRoute when NOT asked to keep it', () => {
    expect(match![1]).toContain('if (!opts?.keepFocusedRoute) logic.setFocusedRoute(null);');
  });
});

describe('DiscoverLayer — hybrid flow dismissed before the JIT-gated start (Location A: HybridOverviewScreen onStart)', () => {
  const match = src.match(/onStart=\{\(\) => \{([\s\S]*?)\n {16}\}\}/);

  it('finds the onStart handler', () => {
    expect(match, 'onStart handler not found — HybridOverviewScreen wiring changed').toBeTruthy();
  });

  it('captures the composed plan BEFORE resetting hybrid state', () => {
    const body = match![1];
    expect(body.indexOf('const c = hybridComposed')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('const c = hybridComposed')).toBeLessThan(body.indexOf("resetHybridFlow('config'"));
  });

  it('dismisses the overview (resetHybridFlow + setMapMode) BEFORE runHybridPlan starts the JIT-gated workout', () => {
    const body = match![1];
    expect(body).toContain("resetHybridFlow('config', { keepFocusedRoute: true })");
    expect(body).toContain("setMapMode('idle')");
    expect(body).toContain('runHybridPlan(c, logic.startActiveWorkout)');
    const resetIdx = body.indexOf("resetHybridFlow('config'");
    const mapIdx = body.indexOf("setMapMode('idle')");
    const runIdx = body.indexOf('runHybridPlan(c, logic.startActiveWorkout)');
    expect(resetIdx).toBeLessThan(runIdx);
    expect(mapIdx).toBeLessThan(runIdx);
  });

  it('passes keepFocusedRoute:true — this is a START, focusedRoute must survive into the active run', () => {
    expect(match![1]).toContain('keepFocusedRoute: true');
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

  it('does NOT pass keepFocusedRoute (this branch already nulls focusedRoute itself one line earlier — a real free/unguided run has no route to preserve)', () => {
    const body = match![0];
    expect(body).toContain('logic.setFocusedRoute(null)');
    expect(body).not.toContain('keepFocusedRoute');
  });
});

describe('DiscoverLayer — every OTHER resetHybridFlow call site keeps clearing focusedRoute (genuine leave/reset, not a start)', () => {
  it('the empty-map-tap dismiss, the X close button, "בנה בעצמי", and the slots re-entry tap all still call resetHybridFlow with no keepFocusedRoute option', () => {
    const calls = Array.from(src.matchAll(/resetHybridFlow\([^)]*\)/g)).map((m) => m[0]);
    const leaveCalls = calls.filter((c) => !c.includes("'config', { keepFocusedRoute: true }"));
    // Every non-start call site must NOT carry keepFocusedRoute.
    expect(leaveCalls.every((c) => !c.includes('keepFocusedRoute'))).toBe(true);
    // Sanity: there are multiple such call sites (dismiss/close/build-yourself/slots),
    // plus the one aerobic_quick call — all still default-clearing.
    expect(leaveCalls.length).toBeGreaterThanOrEqual(5);
  });
});
