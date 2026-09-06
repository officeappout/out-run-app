import { describe, it, expect, vi } from 'vitest';

/**
 * Proves the crash-protection contract David asked for: if
 * buildWeaverInput/weaveWeek throw on an unexpected profile, this function
 * must fail soft (return null), not propagate. Mocked so the throw is
 * guaranteed and deterministic — not relying on finding a real profile
 * shape that happens to crash the engine today.
 *
 * This is the ONLY layer of the two-layer crash protection that's testable
 * in this repo's actual vitest setup — see the file's own header comment
 * and this session's report for why the render-layer (ErrorBoundary
 * wrapping in TrainingPlannerOverlay.tsx) could not be proven the same
 * way: this repo's vitest has no JSX-transform plugin configured, and
 * neither `@vitejs/plugin-react` nor a standalone `esbuild` binary is
 * available to add one without a real dependency install.
 */
vi.mock('../weaverInput', () => ({
  buildWeaverInput: () => {
    throw new Error('ARTIFICIAL CRASH — simulating a buildWeaverInput failure on an unexpected profile');
  },
}));
vi.mock('../scheduleWeaver', () => ({
  weaveWeek: () => {
    throw new Error('should never be called — buildWeaverInput throws first');
  },
}));

describe('computeWeaveResultSafely', () => {
  it('RED (proven first): buildWeaverInput throwing directly, unhandled, would propagate', async () => {
    const { buildWeaverInput } = await import('../weaverInput');
    expect(() => buildWeaverInput({}, 50, 3, new Date())).toThrow('ARTIFICIAL CRASH');
  });

  it('GREEN: computeWeaveResultSafely catches the same throw and returns null instead of propagating', async () => {
    const { computeWeaveResultSafely } = await import('../computeWeaveResultSafely');
    let result: unknown = 'not called yet';
    expect(() => {
      result = computeWeaveResultSafely({}, 50, 3, new Date());
    }).not.toThrow();
    expect(result).toBeNull();
  });
});
