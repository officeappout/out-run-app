/**
 * Regression guard — "צא לדרך" must start the tapped route, not the previously focused one.
 *
 * `logic.startActiveWorkout()` reads `focusedRoute` from its render closure. A call site that does
 * `logic.setFocusedRoute(r)` and then `logic.startActiveWorkout()` in the same tick therefore starts
 * whichever route was focused BEFORE (React state is async) — in discover that was routes[0], the
 * auto-focused first card. Such sites must call `logic.startActiveWorkoutForRoute(r)` instead.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'DiscoverLayer.tsx'), 'utf8').split('\n');

describe('DiscoverLayer start paths', () => {
  it('never calls startActiveWorkout() right after setFocusedRoute(<route>) (stale-closure start)', () => {
    const offenders: string[] = [];
    SRC.forEach((line, i) => {
      if (!/logic\.setFocusedRoute\((?!null\))/.test(line)) return;
      for (let j = i + 1; j <= i + 4 && j < SRC.length; j++) {
        if (/logic\.startActiveWorkout\(\)/.test(SRC[j])) offenders.push(`DiscoverLayer.tsx:${j + 1}  ${SRC[j].trim()}`);
      }
    });
    expect(offenders, `use logic.startActiveWorkoutForRoute(route):\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the curated carousel starts the card\'s own route', () => {
    const body = SRC.join('\n');
    expect(body).toContain('onStartWorkout={(r) => { logic.setFocusedRoute(r); logic.startActiveWorkoutForRoute(r); }}');
  });
});
