/**
 * Who signs the health declaration, and which grammatical gender its copy uses.
 *
 * Legacy (flag off): sessionStorage only — onboarding_personal_name /
 * onboarding_personal_gender, set by the identity screen during full
 * onboarding. A quick-signup user reaching the declaration from the JIT
 * workout-start gate has neither, so the declaration was signed with no name
 * and masculine copy.
 *
 * enable_jit_identity_v1: the profile store first (the JIT gate's identity
 * step writes it), falling back to the same sessionStorage keys.
 */
export type SignerGender = 'male' | 'female';

export interface SignerIdentity {
  userName: string;
  gender: SignerGender;
}

export function resolveSignerIdentity(input: {
  useProfile: boolean;
  profileCore: { name?: unknown; gender?: unknown } | null | undefined;
  sessionName: string | null;
  sessionGender: string | null;
}): SignerIdentity {
  const { useProfile, profileCore, sessionName, sessionGender } = input;
  if (!useProfile) {
    return {
      userName: sessionName || '',
      gender: (sessionGender || 'male') as SignerGender,
    };
  }
  const profileName = typeof profileCore?.name === 'string' ? profileCore.name.trim() : '';
  const profileGender = typeof profileCore?.gender === 'string' ? profileCore.gender : '';
  return {
    userName: profileName || sessionName || '',
    gender: (profileGender || sessionGender || 'male') as SignerGender,
  };
}
