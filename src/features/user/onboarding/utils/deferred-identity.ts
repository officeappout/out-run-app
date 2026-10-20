/**
 * enable_home_v2 (journeys J1 / J2, owner 20.10.2026): a home program card opens the
 * track's questionnaire straight away; name / gender / birth date — when still missing —
 * are asked once, right before the flow's first save (strength: accepting the assessment
 * result; running: the end of the run questionnaire). PURE.
 */
import { hasKnownIdentity } from '@/lib/identity';

export interface DeferredIdentityInput {
  v2: boolean;
  /** The live profile's core (name / gender / birthDate). */
  profileCore: { name?: unknown; gender?: unknown; birthDate?: unknown } | null | undefined;
  /** The onboarding_personal_* sessionStorage keys (set by the identity form). */
  session: { name?: string | null; gender?: string | null; dob?: string | null };
}

/**
 * True when the flow must show the identity screen before saving. Flag off → never (the
 * identity form still comes first, as today). Known from the profile or from this
 * session's identity form → no.
 */
export function needsIdentityBeforeSave({ v2, profileCore, session }: DeferredIdentityInput): boolean {
  if (!v2) return false;
  if (hasKnownIdentity(profileCore)) return false;
  return !(session.name && session.gender && session.dob);
}

/**
 * The visual assessment's demographics from the onboarding_personal_* keys — same math as
 * the page's own mount read (age in whole years on `now`). null when either is missing.
 */
export function demographicsFromSession(
  dob: string | null | undefined,
  gender: string | null | undefined,
  now: Date = new Date(),
): { age: number; gender: 'male' | 'female' } | null {
  if (!dob || !gender) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return { age, gender: gender as 'male' | 'female' };
}
