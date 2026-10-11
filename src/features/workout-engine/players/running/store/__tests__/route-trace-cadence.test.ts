import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression — live-walk route-trace cadence fix (11.10.2026, field feedback:
 * "the map feels dead while walking"). The drawn line only grew every
 * ~30-40s in ~40m jumps, double-gated by a legitimate 4-5m GPS-noise
 * displacement filter AND an unrelated FLUSH_EVERY=10 render-delay batch
 * stacked on top of it. The displacement filter is kept (real noise
 * protection); the batching layer is removed (FLUSH_EVERY: 10 -> 1) so
 * accepted points render promptly.
 *
 * Source-level, not a behavioral import — useRunningPlayer.ts transitively
 * imports a .tsx file deep in its dependency graph, and this repo's vitest
 * cannot parse/import .tsx files at all (see [[vitest-node-only-no-jsdom]]),
 * so the real store can't be imported directly for a test.
 */

const storePath = fileURLToPath(new URL('../useRunningPlayer.ts', import.meta.url));
const storeSrc = readFileSync(storePath, 'utf8');
const appMapPath = fileURLToPath(new URL('../../../../../parks/core/components/AppMap.tsx', import.meta.url));
const appMapSrc = readFileSync(appMapPath, 'utf8');

describe('useRunningPlayer.ts — route-trace batching', () => {
  it('FLUSH_EVERY is 1 (batching removed) — accepted points flush immediately, no longer delayed 10x', () => {
    expect(storeSrc).toContain('const FLUSH_EVERY = 1;');
    expect(storeSrc).not.toContain('const FLUSH_EVERY = 10;');
  });

  it('the DISTANCE_THRESHOLD noise filter this fix deliberately keeps is still present, untouched', () => {
    expect(storeSrc).toContain('const DISTANCE_THRESHOLD_RUNNING = 5;');
    expect(storeSrc).toContain('const DISTANCE_THRESHOLD_WALKING = 4;');
  });

  it('addCoord still flushes via the same buffer mechanism (structural change is the threshold only, not the architecture)', () => {
    expect(storeSrc).toContain('if (_coordBuffer.length >= FLUSH_EVERY) {');
  });
});

describe('AppMap.tsx — live-path + ghost-path cadence comments corrected, dependency unchanged', () => {
  it('the live-path effect and ghost-path memo still share the identical livePath?.length dependency (confirmed, not assumed, that they smooth in lockstep)', () => {
    expect(appMapSrc).toContain('}, [livePath?.length, isActiveWorkout]);');
    expect(appMapSrc).toContain('}, [isActiveWorkout, focusedRoute?.id, focusedRoute?.path, livePath?.length]);');
  });

  it('the misleading "every 5m" framing is corrected with the 11.10.2026 note, not silently deleted', () => {
    const correctionMentions = appMapSrc.split('11.10.2026').length - 1;
    expect(correctionMentions).toBeGreaterThanOrEqual(2);
  });
});
