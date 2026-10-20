import { describe, it, expect, vi } from 'vitest';
import { runOnboardingEntryTap } from '../entry-tap';
import { closeJitWithoutProceeding } from '@/features/user/onboarding/utils/required-setup';

// A home start card (ProgramStartSlide / AddTrackCard / AddStrengthProgramCard)
// locks itself into a loading state on tap. If home's JIT sheet was then closed
// without proceeding, the card used to stay spinning forever.

function card() {
  let loading = false;
  const setLoading = (v: boolean) => { loading = v; };
  return { setLoading, isLoading: () => loading };
}

describe('runOnboardingEntryTap', () => {
  it('no gate → navigates directly and stays locked', () => {
    const c = card();
    const navigate = vi.fn();
    runOnboardingEntryTap(c.setLoading, navigate);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(c.isLoading()).toBe(true);
  });

  it('gate passes → navigates, stays locked (no double tap during the push)', () => {
    const c = card();
    const navigate = vi.fn();
    runOnboardingEntryTap(c.setLoading, navigate, (go) => go());
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(c.isLoading()).toBe(true);
  });

  it('gate opens the JIT sheet, user closes it → loading released, no navigation', () => {
    const c = card();
    const navigate = vi.fn();
    // Mirrors useRequiredSetup: the sheet keeps onCancel; cancelJIT runs it after closing.
    let jit: { onCancel?: (() => void) | null } = {};
    runOnboardingEntryTap(c.setLoading, navigate, (_go, cancel) => { jit = { onCancel: cancel }; });
    expect(c.isLoading()).toBe(true);

    const { next, notify } = closeJitWithoutProceeding(jit);
    notify?.();
    expect(next).toEqual({ isModalOpen: false, requirements: [], onComplete: null, onCancel: null });
    expect(c.isLoading()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('closing a sheet opened by a caller without onCancel is a no-op notify', () => {
    expect(closeJitWithoutProceeding({}).notify).toBeNull();
  });
});
