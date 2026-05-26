'use client';

/**
 * useHealthWithDisclosure
 *
 * Encapsulates the full "show disclosure → request native permissions" flow
 * required by Google Play Health Connect policy and Apple App Store guideline 5.1.1.
 *
 * The hook manages three pieces of state so callers only need to:
 *   1. Render <HealthConnectDisclosureModal {...disclosureProps} /> somewhere in their JSX.
 *   2. Call triggerHealthPermission() on a user gesture (button tap, row press, etc.).
 *
 * Flow:
 *   triggerHealthPermission()
 *     → already granted?  → onGranted() immediately (no modal)
 *     → not native?       → onGranted() immediately (web — no permission needed)
 *     → native + not yet  → open the disclosure modal
 *         user taps "אפשר גישה"
 *           → requestHealthPermissions() (OS dialog)
 *           → granted  → persist flag → onGranted()
 *           → denied   → onDenied()
 *         user taps "לא עכשיו"
 *           → modal closes, nothing happens
 *
 * Returns:
 *   triggerHealthPermission — call on any user gesture
 *   disclosureProps         — spread directly onto <HealthConnectDisclosureModal />
 *   isRequesting            — true while the OS dialog / native call is in-flight
 */

import { useState, useCallback } from 'react';
import { requestHealthPermissions } from '@/lib/healthBridge/init';
import { useSettingsStore } from '@/features/home/store/useSettingsStore';

function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

interface UseHealthWithDisclosureOptions {
  /** Called when permissions are confirmed granted (or not needed on web). */
  onGranted?: () => void;
  /** Called when the OS dialog returns denied. */
  onDenied?: () => void;
}

interface DisclosureProps {
  isOpen: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

interface UseHealthWithDisclosureReturn {
  triggerHealthPermission: () => void;
  disclosureProps: DisclosureProps;
  isRequesting: boolean;
}

export function useHealthWithDisclosure(
  options: UseHealthWithDisclosureOptions = {},
): UseHealthWithDisclosureReturn {
  const { onGranted, onDenied } = options;

  const healthBridgeEnabled = useSettingsStore((s) => s.healthBridgeEnabled);
  const patchSettings = useSettingsStore((s) => s.patch);

  const [showDisclosure, setShowDisclosure] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  /** Actually calls the OS permission dialog. Only invoked after disclosure is confirmed. */
  const runPermissionRequest = useCallback(async () => {
    setShowDisclosure(false);
    setIsRequesting(true);
    try {
      const { granted } = await requestHealthPermissions();
      if (granted) {
        patchSettings({ healthBridgeEnabled: true });
        onGranted?.();
      } else {
        onDenied?.();
      }
    } catch {
      onDenied?.();
    } finally {
      setIsRequesting(false);
    }
  }, [onGranted, onDenied, patchSettings]);

  /**
   * The entry point for every UI gesture (card tap, toggle press, etc.).
   * Short-circuits to onGranted() when permissions are already in place.
   */
  const triggerHealthPermission = useCallback(() => {
    if (healthBridgeEnabled) {
      onGranted?.();
      return;
    }
    if (!isNativeApp()) {
      // On web the permissions concept doesn't apply — treat as granted.
      onGranted?.();
      return;
    }
    // Native + not yet granted: show the required disclosure first.
    setShowDisclosure(true);
  }, [healthBridgeEnabled, onGranted]);

  const disclosureProps: DisclosureProps = {
    isOpen: showDisclosure,
    onConfirm: () => void runPermissionRequest(),
    onDismiss: () => setShowDisclosure(false),
  };

  return { triggerHealthPermission, disclosureProps, isRequesting };
}
