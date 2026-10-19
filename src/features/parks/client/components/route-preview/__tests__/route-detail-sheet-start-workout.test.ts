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
    // Not `[^}]*` — the handler body now contains a nested `if (...) { ... }`
    // block (the start-experience too-far guard, 11.10.2026), so the capture
    // must tolerate inner braces. Anchored on `aria-disabled={isTooFarToStart}`
    // immediately following this button's own onClick close, which is unique
    // to this handler.
    const match = src.match(/onClick=\{\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}\}\s*\n\s*aria-disabled=\{isTooFarToStart\}/);
    expect(match, 'start-workout button onClick handler not found — RouteDetailSheet structure changed').toBeTruthy();
    const handlerBody = match![1];
    expect(handlerBody).toContain('onClose()');
    expect(handlerBody).toContain('onStartWorkout?.(route)');
    // onClose() must run BEFORE onStartWorkout — order, not just presence.
    expect(handlerBody.indexOf('onClose()')).toBeLessThan(handlerBody.indexOf('onStartWorkout?.(route)'));
  });

  it('the too-far guard returns BEFORE onClose/onStartWorkout — a blocked tap never closes the sheet or starts the workout', () => {
    const src = readFileSync(routeDetailSheetPath, 'utf8');
    const match = src.match(/onClick=\{\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}\}\s*\n\s*aria-disabled=\{isTooFarToStart\}/);
    expect(match, 'start-workout button onClick handler not found').toBeTruthy();
    const handlerBody = match![1];
    expect(handlerBody).toContain('if (isTooFarToStart) {');
    expect(handlerBody).toContain('return;');
    const guardIdx = handlerBody.indexOf('if (isTooFarToStart) {');
    const returnIdx = handlerBody.indexOf('return;');
    const onCloseIdx = handlerBody.indexOf('onClose()');
    expect(guardIdx).toBeLessThan(returnIdx);
    expect(returnIdx).toBeLessThan(onCloseIdx);
  });

  it('matches the same onClose-then-onStartWorkout pattern already used by ParkDetailSheet', () => {
    const parkSrc = readFileSync(parkDetailSheetPath, 'utf8');
    // Since the no-monster-files split the handler is passed to the
    // ParkActionBar section as its `onStartWorkout` prop (the button's onClick).
    const parkMatch = parkSrc.match(/on(?:Click|StartWorkout)=\{\(\)\s*=>\s*\{\s*onClose\(\);\s*onStartWorkout\?\.\(\);\s*\}\}/);
    expect(parkMatch, 'ParkDetailSheet no longer has the expected onClose-then-onStartWorkout reference pattern').toBeTruthy();
  });
});
