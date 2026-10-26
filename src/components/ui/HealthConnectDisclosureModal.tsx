'use client';

/**
 * HealthConnectDisclosureModal
 *
 * Google Play Health Connect policy requires a prominent in-app disclosure
 * screen that appears BEFORE the system permission dialog is triggered.
 * Apple HealthKit carries the same expectation via App Store Review Guideline 5.1.1.
 *
 * This modal satisfies both stores by disclosing:
 *   • exactly which data types are read / written
 *   • the sole purpose for each type (personal progress tracking)
 *   • the explicit no-sharing / no-advertising commitment
 *   • a link to the full privacy policy (rendered inline via LegalDocModal)
 *
 * Usage — render once near the root of whichever screen needs it:
 *   <HealthConnectDisclosureModal
 *     isOpen={showDisclosure}
 *     onConfirm={() => { setShowDisclosure(false); void requestHealthPermissions(); }}
 *     onDismiss={() => setShowDisclosure(false)}
 *   />
 *
 * Do NOT trigger requestHealthPermissions() without first showing this modal
 * on a fresh install / when permissions have not yet been granted.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Footprints, Timer, X, ExternalLink } from 'lucide-react';
import LegalDocModal from '@/features/legal/components/LegalDocModal';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import Sheet, { SHEET_TITLE_CLASS } from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { common } from '@/messages/ns/common';

interface HealthConnectDisclosureModalProps {
  isOpen: boolean;
  /** Called when user taps "אפשר גישה" — caller should then invoke requestHealthPermissions(). */
  onConfirm: () => void;
  /** Called when user taps the ✕ or "לא עכשיו". */
  onDismiss: () => void;
  /** Override detected platform label (defaults to "HealthKit / Health Connect"). */
  platformLabel?: string;
}

const DATA_ITEMS = [
  {
    id: 'steps',
    icon: <Footprints size={18} className="text-[#5BC2F2]" aria-hidden="true" />,
    labelKey: 'ui.health.steps.label',
    purposeKey: 'ui.health.steps.purpose',
    accessKey: 'ui.health.steps.access',
  },
  {
    id: 'exercise',
    icon: <Timer size={18} className="text-emerald-500" aria-hidden="true" />,
    labelKey: 'ui.health.exercise.label',
    purposeKey: 'ui.health.exercise.purpose',
    accessKey: 'ui.health.exercise.access',
  },
] as const;

export default function HealthConnectDisclosureModal({
  isOpen,
  onConfirm,
  onDismiss,
  platformLabel = 'HealthKit / Health Connect',
}: HealthConnectDisclosureModalProps) {
  const t = useT(common);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  // enable_home_v2: the shared <Sheet> shell only — the disclosure text, both
  // buttons, their order and every dismissal path are the same in both branches.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  const body = (
    <div className="px-5 pb-6 space-y-5">
      {/* ── Platform label ── */}
      <p className="text-xs text-slate-500 leading-relaxed">
        {t.rich('ui.health.intro', { platform: platformLabel, b: (chunks: React.ReactNode) => <span className="font-semibold text-slate-700">{chunks}</span> })}
      </p>

      {/* ── Data items table ── */}
      <div className="space-y-2.5">
        {DATA_ITEMS.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 bg-slate-50 rounded-xl px-3.5 py-3"
          >
            <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 leading-snug">
                {t(item.labelKey)}
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  ({t(item.accessKey)})
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {t(item.purposeKey)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Commitment box ── */}
      <div className="bg-emerald-50 border border-emerald-200/70 rounded-xl px-4 py-3.5 space-y-1.5">
        <p className="text-xs font-bold text-emerald-800">
          {t('ui.health.commitments')}
        </p>
        <ul className="space-y-1 text-xs text-emerald-700 leading-relaxed list-none">
          <li>{t('ui.health.commit.1')}</li>
          <li>{t('ui.health.commit.2')}</li>
          <li>{t('ui.health.commit.3')}</li>
          <li>{t('ui.health.commit.4')}</li>
          <li>{t('ui.health.commit.5')}</li>
          <li>{t('ui.health.commit.6')}</li>
        </ul>
      </div>

      {/* ── Privacy policy link ── */}
      <button
        type="button"
        onClick={() => setShowPrivacyModal(true)}
        className="flex items-center gap-1.5 text-xs text-[#5BC2F2] hover:text-[#4AADE3] transition-colors"
      >
        <ExternalLink size={12} />
        <span>{t('ui.health.privacyLink')}</span>
      </button>

      {/* ── CTAs ── */}
      <div className="flex flex-col gap-2.5 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          className="w-full bg-brand-cta hover:brightness-105 active:scale-[0.98] text-on-brand font-bold py-3.5 rounded-2xl shadow-md shadow-[#5BC2F2]/20 transition-all text-sm"
        >
          {t('ui.health.allow')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full text-slate-500 font-medium py-2.5 rounded-2xl hover:bg-slate-50 transition-colors text-sm"
        >
          {t('ui.health.notNow')}
        </button>
      </div>
    </div>
  );

  const privacyModal = (
    <LegalDocModal
      type="privacy"
      isOpen={showPrivacyModal}
      onClose={() => setShowPrivacyModal(false)}
    />
  );

  if (v2) {
    return (
      <>
        <Sheet
          open={isOpen}
          // Backdrop tap and ✕ dismiss, exactly as before (no drag, no Escape).
          onClose={onDismiss}
          layout="nested"
          // One z-[120] layer (.cursorrules); LegalDocModal (z-[130]/[131]) opens over it.
          zIndex={SHEET_Z.healthDisclosure}
          portal={false}
          keyboardAware={false}
          backdropClassName="bg-black/50"
          backdropStyle={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          frameClassName="w-full max-w-lg"
          scroll="panel"
          className="max-h-[92dvh]"
          // The body already ends with pb-6 — only the home-indicator inset on top.
          safeArea="env(safe-area-inset-bottom)"
          grabber={false}
          transition={{ type: 'spring', damping: 32, stiffness: 300 }}
          ariaLabel={t('ui.health.title')}
          header={
            <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 shrink-0 text-v2-deep" aria-hidden="true" />
                <h2 className={`${SHEET_TITLE_CLASS} truncate`}>{t('ui.health.title')}</h2>
              </div>
              <IconButton aria-label={t('ui.health.close')} tone="surface" size={36} className="shrink-0" onClick={onDismiss}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          }
        >
          {body}
        </Sheet>
        {privacyModal}
      </>
    );
  }

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="hc-disclosure-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50"
            style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            onClick={onDismiss}
          >
            <motion.div
              key="hc-disclosure-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-lg rounded-t-3xl shadow-2xl overflow-hidden"
              dir="rtl"
            >
              {/* ── Header ── */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={22} className="text-[#5BC2F2] flex-shrink-0" />
                  <h2 className="text-base font-black text-slate-900">
                    {t('ui.health.title')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label={t('ui.health.close')}
                  className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <X size={18} className="text-slate-500" />
                </button>
              </div>

              {body}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full privacy policy modal — opened from the link inside this disclosure */}
      {privacyModal}
    </>
  );
}
