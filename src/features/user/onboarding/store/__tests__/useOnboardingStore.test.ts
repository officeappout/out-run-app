import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// P0-2 (24.09.2026, see docs/audit-2026-09/00-MASTER-PLAN.md §13.23): the
// store's debounced (400ms) sync used to unconditionally claim
// onboardingStep/onboardingStatus on every updateData()/setStep() call —
// racing a page's real completion write. This proves the store's own half
// of the fix: every debounced dispatch (whether via the 400ms timer or
// flushPendingSync()'s immediate bypass) passes skipProgressFields: true.

const syncMock = vi.hoisted(() =>
  vi.fn(async (_step: string, _data: unknown, _options?: { skipProgressFields?: boolean }) => true),
);

vi.mock('@/features/user/onboarding/services/onboarding-sync.service', () => ({
  syncOnboardingToFirestore: syncMock,
}));

import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';

describe('useOnboardingStore — P0-2: debounced sync never claims onboardingStep/onboardingStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncMock.mockClear();
    useOnboardingStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updateData() eventually syncs with skipProgressFields: true (the timer path)', async () => {
    useOnboardingStore.getState().updateData({ scheduleDays: ['א'] } as any);

    await vi.advanceTimersByTimeAsync(400);

    expect(syncMock).toHaveBeenCalledTimes(1);
    const [, , options] = syncMock.mock.calls[0];
    expect(options).toEqual({ skipProgressFields: true });
  });

  it('setStep() also syncs with skipProgressFields: true — even though nothing in the live app calls setStep today', async () => {
    useOnboardingStore.getState().setStep('SCHEDULE' as any);

    await vi.advanceTimersByTimeAsync(400);

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock.mock.calls[0][2]).toEqual({ skipProgressFields: true });
  });

  it('flushPendingSync() bypasses the timer but not the flag', async () => {
    useOnboardingStore.getState().updateData({ scheduleDays: ['א'] } as any);

    await useOnboardingStore.getState().flushPendingSync();

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock.mock.calls[0][2]).toEqual({ skipProgressFields: true });
  });
});
