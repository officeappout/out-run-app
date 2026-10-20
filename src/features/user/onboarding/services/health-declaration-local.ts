/**
 * Mirror a just-signed health declaration into the in-memory user profile.
 *
 * HealthDeclarationStep persists the signature to users/{uid}/private/legal and
 * the flag to users/{uid} via the onboarding store's 400 ms debounced sync —
 * but nothing refreshed useUserStore.profile, so every gate that reads it
 * (the JIT workout-start gate on home / map, /onboarding-new/health) asked
 * again in the same session. Local-only: Firestore still gets the flag through
 * the existing sync; no schema change.
 */
import { useUserStore } from '../../identity/store/useUserStore';

export function markHealthDeclarationAcceptedLocally(): void {
  const { profile, updateProfile } = useUserStore.getState();
  if (!profile || profile.healthDeclarationAccepted === true) return;
  updateProfile({ healthDeclarationAccepted: true });
}
