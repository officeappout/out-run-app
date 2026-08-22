'use client';

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { syncFieldToFirestore } from '@/lib/firestore.service';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

/**
 * useEmailCapture — post-workout account-secure prompt.
 *
 * Auto-opens the email capture drawer 1.2s after mount IF the user is:
 *   1. Anonymous (Firebase auth)
 *   2. Has no email on profile
 *   3. Has not dismissed the prompt in this session
 *
 * Provides the two-step state machine:
 *   • `showEmailDrawer`   — bottom-sheet visible
 *   • `showInlineAccount` — flipped from intro screen to AccountSecureStep
 *
 * Captures behaviour:
 *   • On successful capture: syncs email to Firestore + closes drawer
 *   • On dismiss: writes a session flag so the prompt stays gone for the session
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-4).
 */

export interface UseEmailCaptureResult {
  showEmailDrawer: boolean;
  showInlineAccount: boolean;
  /** Advance from the intro screen to the inline AccountSecureStep. */
  setShowInlineAccount: (v: boolean) => void;
  /** Wired to `AccountSecureStep.onNext` — persists the email then closes. */
  handleEmailCaptured: (secured: boolean, method?: string, email?: string) => Promise<void>;
  /** Wired to scrim/skip buttons — marks the prompt dismissed and closes. */
  dismissEmailDrawer: () => void;
}

export interface UseEmailCaptureParams {
  /**
   * Read-only history view of an already-saved workout — never auto-open
   * the account-secure drawer (no data-safety concern, just wrong UX to
   * prompt account setup while passively reviewing an old workout).
   */
  isReadOnly?: boolean;
}

export function useEmailCapture(params: UseEmailCaptureParams = {}): UseEmailCaptureResult {
  const { isReadOnly = false } = params;
  const { profile } = useUserStore();

  const [showEmailDrawer, setShowEmailDrawer] = useState(false);
  const [showInlineAccount, setShowInlineAccount] = useState(false);

  useEffect(() => {
    if (isReadOnly) return;
    const isAnonymous = auth.currentUser?.isAnonymous ?? true;
    const hasEmail = !!profile?.core?.email;
    const dismissed = typeof window !== 'undefined'
      ? sessionStorage.getItem('dismissed_email_cta') === 'true'
      : false;

    if (!hasEmail && isAnonymous && !dismissed) {
      const timer = setTimeout(() => setShowEmailDrawer(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [profile, isReadOnly]);

  const handleEmailCaptured = async (
    secured: boolean,
    _method?: string,
    email?: string,
  ): Promise<void> => {
    if (secured && email) {
      await syncFieldToFirestore('core.email', email);
    }
    setShowInlineAccount(false);
    setShowEmailDrawer(false);
  };

  const dismissEmailDrawer = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dismissed_email_cta', 'true');
    }
    setShowEmailDrawer(false);
  };

  return {
    showEmailDrawer,
    showInlineAccount,
    setShowInlineAccount,
    handleEmailCaptured,
    dismissEmailDrawer,
  };
}
