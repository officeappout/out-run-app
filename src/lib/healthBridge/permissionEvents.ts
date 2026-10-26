/**
 * "The health permission flag may have changed" signal (pilot O12).
 *
 * useHealthConnected used to read PREF_KEY_PERMISSIONS once, on mount. Every grant that
 * did not come from home's own reload path (the onboarding step, StepsSummaryCard, the
 * Android permissionsChanged event, the post sign-in reconciliation, a grant made in the OS
 * settings) left the "connect your steps" card on screen until the next real remount.
 *
 * init.ts calls notifyHealthPermissionChanged() after every write of the flag; the hook
 * re-reads on that event and whenever the app comes back to the foreground.
 */
export const HEALTH_PERMISSION_CHANGED_EVENT = 'outrun:health-permission-changed';

type Target = Pick<EventTarget, 'addEventListener' | 'removeEventListener' | 'dispatchEvent'>;

function windowTarget(): Target | null {
  return typeof window !== 'undefined' ? window : null;
}

export function notifyHealthPermissionChanged(target: Target | null = windowTarget()): void {
  try {
    target?.dispatchEvent(new Event(HEALTH_PERMISSION_CHANGED_EVENT));
  } catch {
    /* no Event constructor (very old WebView): the next mount re-reads anyway */
  }
}

/**
 * Calls `onChange` when the flag was written, or when the page becomes visible again
 * (the user may have granted it in the OS settings). Returns the unsubscribe.
 */
export function subscribeHealthPermissionChanged(
  onChange: () => void,
  target: Target | null = windowTarget(),
  doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null =
    typeof document !== 'undefined' ? document : null,
): () => void {
  const onVisible = () => {
    if (doc?.visibilityState === 'visible') onChange();
  };
  target?.addEventListener(HEALTH_PERMISSION_CHANGED_EVENT, onChange);
  doc?.addEventListener('visibilitychange', onVisible);
  return () => {
    target?.removeEventListener(HEALTH_PERMISSION_CHANGED_EVENT, onChange);
    doc?.removeEventListener('visibilitychange', onVisible);
  };
}
