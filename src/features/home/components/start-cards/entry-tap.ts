/**
 * Pure core of useOnboardingEntryTap: lock the card, then either go straight to
 * the entry or hand both outcomes to home's gate. `cancel` (gate closed without
 * proceeding) unlocks the card so it doesn't stay spinning.
 */
export type OnboardingEntryNavigate = (navigate: () => void, cancel: () => void) => void;

export function runOnboardingEntryTap(
  setLoading: (loading: boolean) => void,
  navigate: () => void,
  onNavigate?: OnboardingEntryNavigate,
): void {
  setLoading(true);
  if (!onNavigate) {
    navigate();
    return;
  }
  onNavigate(navigate, () => setLoading(false));
}
