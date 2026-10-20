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

describe('getMissingRequirements — enable_jit_identity_v1 (identity before the health declaration)', () => {
  const on = { requireIdentity: true };
  const idsOn = (p: Partial<UserFullProfile>, a: Parameters<typeof getMissingRequirements>[1]) =>
    getMissingRequirements(p as UserFullProfile, a, on).map((r) => r.id);
  // A quick-signup (MAP_ONLY) profile: no name, gender 'other', no birth date.
  const quickSignup = {
    ...noEquipment,
    onboardingPath: 'MAP_ONLY',
    core: { name: '', gender: 'other' },
  } as unknown as Partial<UserFullProfile>;
  const known = { name: 'נועה', gender: 'female', birthDate: new Date(1994, 3, 12) };

  it('no name → identity, then health (both hard blocks, identity first)', () => {
    const reqs = getMissingRequirements(quickSignup as UserFullProfile, 'running', on);
    expect(reqs.map((r) => r.id)).toEqual(['identity', 'health']);
    expect(reqs.every((r) => r.isHardBlock)).toBe(true);
    expect(reqs[0].step).toBe('IDENTITY');
  });

  it('identity comes before health and before equipment on a strength start', () => {
    expect(idsOn(quickSignup, 'strength')).toEqual(['identity', 'health', 'equipment']);
  });

  it('a name but no birth date / gender still asks for identity', () => {
    expect(idsOn({ ...noEquipment, core: { name: 'דן' } } as never, 'running')).toEqual(['identity', 'health']);
    expect(idsOn({ ...noEquipment, core: { name: 'דן', gender: 'male' } } as never, 'running')).toEqual(['identity', 'health']);
  });

  it('known identity, not signed → health only', () => {
    expect(idsOn({ ...noEquipment, core: known } as never, 'running')).toEqual(['health']);
  });

  it('has a name and accepted → nothing', () => {
    expect(idsOn({ ...noEquipment, core: known, healthDeclarationAccepted: true } as never, 'running')).toEqual([]);
  });

  it('already signed (even without a name) → identity is not asked by this gate', () => {
    expect(idsOn({ ...quickSignup, healthDeclarationAccepted: true }, 'running')).toEqual([]);
  });

  it('flag off → the old list (health only, no identity)', () => {
    expect(ids(quickSignup, 'running')).toEqual(['health']);
    expect(getMissingRequirements(quickSignup as UserFullProfile, 'strength', { requireIdentity: false }).map((r) => r.id))
      .toEqual(['health', 'equipment']);
  });
});
