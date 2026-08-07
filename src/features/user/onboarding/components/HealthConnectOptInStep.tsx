'use client';

/**
 * HealthConnectOptInStep
 *
 * Optional onboarding step, shown right after HealthDeclarationStep, only if
 * the user hasn't already connected HealthKit/Health Connect. Declining or
 * skipping here is a SOFT "deferred" state — it does NOT set PREF_KEY_ASKED,
 * so the profile and steps-ring entry points can still offer to connect
 * again later without this counting as a real OS-dialog denial.
 *
 * Never blocks onboarding completion — onContinue() fires regardless of
 * whether the user connects, defers, or the OS dialog itself is denied.
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Footprints, ChevronLeft } from 'lucide-react';
import { useHealthWithDisclosure } from '@/hooks/useHealthWithDisclosure';
import HealthConnectDisclosureModal from '@/components/ui/HealthConnectDisclosureModal';
import { getHealthPermissionState, deferHealthPermissionOnboarding } from '@/lib/healthBridge/init';

interface HealthConnectOptInStepProps {
  onContinue: () => void;
}

export default function HealthConnectOptInStep({ onContinue }: HealthConnectOptInStepProps) {
  const [checking, setChecking] = useState(true);
  const [isDeferring, setIsDeferring] = useState(false);

  const { triggerHealthPermission, disclosureProps, isRequesting, unavailableReason } =
    useHealthWithDisclosure({
      onGranted: onContinue,
      onDenied: onContinue,
    });

  // Already granted, or not native (web has no permission concept) — skip
  // this step entirely, don't show anything.
  useEffect(() => {
    let cancelled = false;
    void getHealthPermissionState().then((state) => {
      if (cancelled) return;
      if (state === 'granted') {
        onContinue();
        return;
      }
      setChecking(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSkip = async () => {
    setIsDeferring(true);
    try {
      await deferHealthPermissionOnboarding();
    } finally {
      onContinue();
    }
  };

  if (checking) return null;

  // HC genuinely unavailable on this device — nothing useful to offer here,
  // the steps-ring entry point will surface the install-prompt UI later.
  if (unavailableReason) {
    onContinue();
    return null;
  }

  return (
    <div className="flex flex-col h-full w-full min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 px-4" dir="rtl">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 pb-24">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
          className="w-20 h-20 rounded-full bg-[#5BC2F2]/10 flex items-center justify-center"
        >
          <Footprints size={36} className="text-[#5BC2F2]" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="space-y-2 max-w-sm"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          <h1 className="text-lg font-black text-slate-900">
            רוצה שנעקוב אחרי הצעדים שלך?
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            חיבור ל-{'Apple Health / Google Health Connect'} מציג לך את הצעדים והקלוריות היומיים ישירות באפליקציה. אפשר לחבר גם מאוחר יותר מהפרופיל.
          </p>
        </motion.div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-100 px-4 pt-4 z-30"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        <button
          type="button"
          onClick={triggerHealthPermission}
          disabled={isRequesting || isDeferring}
          className="w-full font-bold py-4 rounded-2xl transition-all text-base text-white active:scale-[0.98] disabled:opacity-60"
          style={{
            fontFamily: 'var(--font-simpler)',
            background: 'linear-gradient(98deg, #0CF2E3 0%, #00BAF7 98%)',
            boxShadow: '0 8px 28px rgba(0,186,247,0.4), 0 3px 10px rgba(139,92,246,0.18)',
          }}
        >
          {isRequesting ? 'מתחבר...' : 'חבר את הצעדים שלי'}
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={isRequesting || isDeferring}
          className="w-full text-slate-500 font-medium py-3 rounded-2xl hover:bg-slate-50 transition-colors text-sm flex items-center justify-center gap-1 disabled:opacity-60"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          <span>אולי מאוחר יותר</span>
          <ChevronLeft size={14} />
        </button>
      </div>

      <HealthConnectDisclosureModal {...disclosureProps} />
    </div>
  );
}
