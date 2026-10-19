/**
 * Gender + first name for the lifestyle wizard screens (PersonaStep,
 * ScheduleStep, RunningScheduleStep, LifestyleWizard).
 *
 * The profile wins (19.10.2026 audit fix §3.7): those screens open from /home
 * in later sessions, where sessionStorage is empty (iOS wipes it), so women
 * used to get male copy and the "היי {name}" greeting was blank. During
 * signup there may be no profile yet — then the signup's sessionStorage
 * answers are the fallback, exactly as before.
 */

export type WizardGender = 'male' | 'female';

export function resolveWizardGender(
  profileGender: unknown,
  storedGender: string | null | undefined,
): WizardGender {
  if (profileGender === 'female' || profileGender === 'male') return profileGender;
  return storedGender === 'female' ? 'female' : 'male';
}

/** First word of the profile's display name, else the signup's stored name. */
export function resolveWizardFirstName(
  profileName: unknown,
  storedName: string | null | undefined,
): string {
  if (typeof profileName === 'string' && profileName.trim()) {
    return profileName.trim().split(/\s+/)[0];
  }
  return (storedName ?? '').trim();
}
