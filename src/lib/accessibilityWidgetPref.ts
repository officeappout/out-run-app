/**
 * accessibilityWidgetPref.ts
 *
 * Opt-in preference for the third-party UserWay accessibility toolbar.
 * DEFAULT IS OFF: no third-party script is loaded until the user turns this on
 * in Settings (see AccessibilityWidgetLoader).
 *
 * Stored through onboardingPrefs (localStorage + @capacitor/preferences on
 * native) rather than plain localStorage: WKWebView can evict localStorage
 * between launches (axioms §19), which would silently switch the toolbar off
 * for the very users who turned it on. Per-device by design — it is not
 * written to the Firestore profile.
 */
import {
  getOnboardingPrefAsync,
  setOnboardingPref,
} from '@/lib/onboardingPrefs';

export const A11Y_WIDGET_PREF_KEY = 'a11y_widget_enabled';
/** Same-tab change notification (the native `storage` event only fires in OTHER tabs). */
export const A11Y_WIDGET_EVENT = 'a11y-widget-pref-change';

export async function readA11yWidgetEnabled(): Promise<boolean> {
  return (await getOnboardingPrefAsync(A11Y_WIDGET_PREF_KEY)) === '1';
}

export function writeA11yWidgetEnabled(enabled: boolean): void {
  setOnboardingPref(A11Y_WIDGET_PREF_KEY, enabled ? '1' : '0');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<boolean>(A11Y_WIDGET_EVENT, { detail: enabled }));
  }
}
