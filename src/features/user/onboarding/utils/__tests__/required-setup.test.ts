import { describe, it, expect } from 'vitest';
import { getMissingRequirements } from '../required-setup';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

const ids = (p: Partial<UserFullProfile>, a: Parameters<typeof getMissingRequirements>[1]) =>
  getMissingRequirements(p as UserFullProfile, a).map((r) => r.id);

const noEquipment = { equipment: { home: [], outdoor: [], office: [] } } as unknown as Partial<UserFullProfile>;

describe("getMissingRequirements — 'program-signup' (home start / add-track cards)", () => {
  it('a runner with no equipment adding strength is not asked for equipment', () => {
    expect(ids({ ...noEquipment, healthDeclarationAccepted: true }, 'program-signup')).toEqual([]);
  });

  it('still hard-blocks on a missing health declaration', () => {
    expect(ids(noEquipment, 'program-signup')).toEqual(['health']);
  });

  it('a real strength workout start still asks for equipment', () => {
    expect(ids({ ...noEquipment, healthDeclarationAccepted: true }, 'strength')).toEqual(['equipment']);
    expect(ids({ ...noEquipment, healthDeclarationAccepted: true }, 'unknown')).toEqual(['equipment']);
  });
});
