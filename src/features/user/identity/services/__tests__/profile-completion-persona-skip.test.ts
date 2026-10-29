import { describe, it, expect } from 'vitest';
import { calculateProfileCompletion } from '../profile-completion.service';
import type { UserFullProfile } from '../../../core/types/user.types';

const base = { core: { name: 'A' }, progression: { domains: { upper_push: { currentLevel: 2 } } } } as unknown as UserFullProfile;
const personaItem = (p: UserFullProfile, hidden = false) => calculateProfileCompletion(p, undefined, hidden).items.find((i) => i.id === 'persona');

describe('profile completion: persona item', () => {
  it('incomplete with neither personas nor the skip marker', () => {
    expect(personaItem(base)?.completed).toBe(false);
  });
  it('complete when the persona step was skipped on purpose (non-he)', () => {
    expect(personaItem({ ...base, personaStepSkipped: true } as UserFullProfile)?.completed).toBe(true);
  });
  it('complete (no dead tap) when the persona step is hidden for this UI, no marker needed', () => {
    expect(personaItem(base, true)?.completed).toBe(true);
    expect(personaItem(base, false)?.completed).toBe(false);
  });
});
