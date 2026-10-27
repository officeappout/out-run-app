import { describe, it, expect } from 'vitest';
import { calculateProfileCompletion } from '../profile-completion.service';
import type { UserFullProfile } from '../../../core/types/user.types';

const base = { core: { name: 'A' }, progression: { domains: { upper_push: { currentLevel: 2 } } } } as unknown as UserFullProfile;
const personaItem = (p: UserFullProfile) => calculateProfileCompletion(p).items.find((i) => i.id === 'persona');

describe('profile completion: persona item', () => {
  it('incomplete with neither personas nor the skip marker', () => {
    expect(personaItem(base)?.completed).toBe(false);
  });
  it('complete when the persona step was skipped on purpose (non-he)', () => {
    expect(personaItem({ ...base, personaStepSkipped: true } as UserFullProfile)?.completed).toBe(true);
  });
});
