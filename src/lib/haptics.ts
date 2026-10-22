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
 *
 * enable_haptics_v1 (haptics-gate.ts): with the flag on, every call here obeys
 * the user's "רטט" setting, reduced motion and native-only; hapticTap() is the
 * ONE entry for the v1 additions (no-op while the flag is off). Flag off =
 * the functions below behave exactly as before.
 */

import { hapticAllowed } from './haptics-gate';

async function impact(style: 'Light' | 'Medium' | 'Heavy'): Promise<void> {
  if (!hapticAllowed('existing')) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle[style] });
  } catch {
    /* no-op — haptics are a nice-to-have, never block the caller */
  }
}

async function notification(type: 'Success' | 'Warning' | 'Error'): Promise<void> {
  if (!hapticAllowed('existing')) return;
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
  if (!hapticAllowed('existing')) return;
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

/**
 * enable_haptics_v1 — the one helper for the v1 additions: a light selection
 * tick (pickers, segmented controls) or a light impact (primary buttons in the
 * live players). No-op while the flag is off, the user turned "רטט" off,
 * reduced motion is on, or on the web.
 */
export function hapticTap(kind: 'selection' | 'impact' = 'impact'): void {
  if (!hapticAllowed('new')) return;
  if (kind === 'selection') {
    (async () => {
      try {
        const { Haptics } = await import('@capacitor/haptics');
        await Haptics.selectionChanged();
      } catch {
        /* no-op */
      }
    })();
    return;
  }
  (async () => {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      /* no-op */
    }
  })();
}
