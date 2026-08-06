import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Regression guard for the "health-declaration popup opens behind other
 * content" bug: RouteDetailSheet's "התחל אימון" handler used to call
 * onStartWorkout without first closing the sheet, leaving the sheet
 * (z-[100]) mounted on top of the lower-z JITSetupModal (z-[90]) that
 * onStartWorkout triggers. No jsdom/component-render harness exists in
 * this repo (vitest.config.ts: "node" env only) — this asserts the fix
 * at the source level, mirroring the already-correct ParkDetailSheet
 * pattern, rather than rendering the component.
 */

const routeDetailSheetPath = fileURLToPath(
  new URL('../RouteDetailSheet.tsx', import.meta.url),
);
const parkDetailSheetPath = path.resolve(
  path.dirname(routeDetailSheetPath),
  '../park-detail/ParkDetailSheet.tsx',
);

describe('RouteDetailSheet — "התחל אימון" closes the sheet before starting the workout', () => {
  it('calls onClose() before onStartWorkout in the start-workout handler', () => {
    const src = readFileSync(routeDetailSheetPath, 'utf8');
    const match = src.match(/onClick=\{\(\)\s*=>\s*\{([^}]*)\}\}\s*\n\s*className="flex-1 text-white font-extrabold/);
    expect(match, 'start-workout button onClick handler not found — RouteDetailSheet structure changed').toBeTruthy();
    const handlerBody = match![1];
    expect(handlerBody).toContain('onClose()');
    expect(handlerBody).toContain('onStartWorkout?.(route)');
    // onClose() must run BEFORE onStartWorkout — order, not just presence.
    expect(handlerBody.indexOf('onClose()')).toBeLessThan(handlerBody.indexOf('onStartWorkout?.(route)'));
  });

  it('matches the same onClose-then-onStartWorkout pattern already used by ParkDetailSheet', () => {
    const parkSrc = readFileSync(parkDetailSheetPath, 'utf8');
    const parkMatch = parkSrc.match(/onClick=\{\(\)\s*=>\s*\{\s*onClose\(\);\s*onStartWorkout\?\.\(\);\s*\}\}/);
    expect(parkMatch, 'ParkDetailSheet no longer has the expected onClose-then-onStartWorkout reference pattern').toBeTruthy();
  });
});
