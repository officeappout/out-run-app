'use client';

/**
 * Shared haptic feedback utility. Wraps @capacitor/haptics, which bridges to
 * the native iOS Taptic Engine / Android Vibrator (and falls back to the
 * Vibration API on plain web) — unlike raw navigator.vibrate(), which has no
 * iOS support at all. One named function per category so call sites never
 * need to think about ImpactStyle/NotificationType directly.
 *
 * Fire-and-forget by design: never await these at the call site, and a
 * failure here must never break the tap/scroll handler it's attached to.
 */

async function impact(style: 'Light' | 'Medium' | 'Heavy'): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle[style] });
  } catch {
    /* no-op — haptics are a nice-to-have, never block the caller */
  }
}

async function notification(type: 'Success' | 'Warning' | 'Error'): Promise<void> {
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType[type] });
  } catch {
    /* no-op */
  }
}

export function hapticLight(): void {
  void impact('Light');
}

export function hapticMedium(): void {
  void impact('Medium');
}

export function hapticHeavy(): void {
  void impact('Heavy');
}

export function hapticSelection(): void {
  (async () => {
    try {
      const { Haptics } = await import('@capacitor/haptics');
      await Haptics.selectionChanged();
    } catch {
      /* no-op */
    }
  })();
}

export function hapticSuccess(): void {
  void notification('Success');
}

export function hapticWarning(): void {
  void notification('Warning');
}

export function hapticError(): void {
  void notification('Error');
}
