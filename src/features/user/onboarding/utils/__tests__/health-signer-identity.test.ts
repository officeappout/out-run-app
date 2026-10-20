import { describe, it, expect } from 'vitest';
import { resolveSignerIdentity } from '../health-signer-identity';

describe('resolveSignerIdentity', () => {
  it('flag off → sessionStorage only (legacy), defaults to male + empty name', () => {
    expect(resolveSignerIdentity({
      useProfile: false,
      profileCore: { name: 'נועה', gender: 'female' },
      sessionName: null,
      sessionGender: null,
    })).toEqual({ userName: '', gender: 'male' });
    expect(resolveSignerIdentity({
      useProfile: false,
      profileCore: null,
      sessionName: 'דן',
      sessionGender: 'female',
    })).toEqual({ userName: 'דן', gender: 'female' });
  });

  it('flag on → the profile store wins (JIT identity step just saved it)', () => {
    expect(resolveSignerIdentity({
      useProfile: true,
      profileCore: { name: 'נועה', gender: 'female' },
      sessionName: null,
      sessionGender: null,
    })).toEqual({ userName: 'נועה', gender: 'female' });
  });

  it('flag on → falls back to sessionStorage when the profile has nothing', () => {
    expect(resolveSignerIdentity({
      useProfile: true,
      profileCore: { name: '' },
      sessionName: 'דן',
      sessionGender: 'male',
    })).toEqual({ userName: 'דן', gender: 'male' });
    expect(resolveSignerIdentity({
      useProfile: true,
      profileCore: undefined,
      sessionName: null,
      sessionGender: null,
    })).toEqual({ userName: '', gender: 'male' });
  });
});
