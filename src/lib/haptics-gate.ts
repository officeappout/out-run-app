/**
 * haptics-gate — who may buzz (enable_haptics_v1, owner 22.10).
 *
 * Two kinds of calls go through src/lib/haptics:
 *   • existing   — the haptics the app already plays (WheelPicker, timers, toggles…).
 *                  Flag off → exactly as today (always try).
 *   • new        — the v1 additions via hapticTap() (live-player primary buttons,
 *                  segmented controls, the set-logger wheel). Flag off → never.
 * Flag on, both kinds obey the same policy: the user's "רטט" setting (default on),
 * the OS reduced-motion preference, and native only (on the web it is a no-op —
 * the browser Vibration API is unreliable and absent on iOS).
 *
 * The flag is read synchronously: this viewer's resolved flags (super-admin
 * preview included) when cached on the device, else the live panel value.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';
import { readLastViewerUid, readViewerFlags } from '@/hooks/feature-flag-viewer-cache';

export const HAPTICS_PREF_KEY = 'out-haptics-enabled';

export interface HapticGateInput {
  flagOn: boolean;
  prefOn: boolean;
  reducedMotion: boolean;
  native: boolean;
}

/** Pure policy. `kind` = an existing call or a v1 (hapticTap) call. */
export function hapticGate(kind: 'existing' | 'new', i: HapticGateInput): boolean {
  if (!i.flagOn) return kind === 'existing';
  return i.prefOn && !i.reducedMotion && i.native;
}

export function readHapticsV1Flag(): boolean {
  try {
    const viewer = readViewerFlags(readLastViewerUid());
    if (viewer && typeof viewer.enableHapticsV1 === 'boolean') return viewer.enableHapticsV1;
  } catch {
    /* fall through to the live value */
  }
  return readLiveFlag('enableHapticsV1');
}

/** The user's "רטט" setting on this device. Default on. */
export function readHapticsPref(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    return window.localStorage.getItem(HAPTICS_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeHapticsPref(on: boolean): void {
  try {
    window.localStorage.setItem(HAPTICS_PREF_KEY, on ? '1' : '0');
  } catch {
    /* private mode etc. — the toggle just won't persist */
  }
}

function readReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function readNative(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

export function hapticAllowed(kind: 'existing' | 'new'): boolean {
  const flagOn = readHapticsV1Flag();
  if (!flagOn) return kind === 'existing';
  return hapticGate(kind, { flagOn, prefOn: readHapticsPref(), reducedMotion: readReducedMotion(), native: readNative() });
}
