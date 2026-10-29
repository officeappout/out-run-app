import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/onboarding-sync.service', () => ({ syncOnboardingToFirestore: vi.fn().mockResolvedValue(true) }));

import { useOnboardingStore } from '../useOnboardingStore';

describe('personaStepSkipped marker in the onboarding store', () => {
  it('is cleared when personas are answered later', () => {
    useOnboardingStore.getState().updateData({ personaStepSkipped: true });
    expect(useOnboardingStore.getState().data.personaStepSkipped).toBe(true);
    useOnboardingStore.getState().updateData({ selectedPersonaIds: ['student'] });
    expect(useOnboardingStore.getState().data.personaStepSkipped).toBe(false);
  });
  it('is left alone by unrelated updates', () => {
    useOnboardingStore.getState().updateData({ personaStepSkipped: true });
    useOnboardingStore.getState().updateData({ selectedPersonaIds: [] });
    expect(useOnboardingStore.getState().data.personaStepSkipped).toBe(true);
  });
});
