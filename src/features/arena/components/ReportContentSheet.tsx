'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, X, Loader2, Check } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import Sheet from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { CONFIRM_ACTION_CLASS } from '@/components/ui/v2/ConfirmSheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

/**
 * Reason taxonomy.
 *
 * Phase 7.2 expansion: when reporting a *user* (not a piece of content),
 * the "ספאם" and "מידע מטעה" reasons make less sense as categories. We
 * gate them in `reasonsForType()` so the UI shows the right subset for
 * each target without duplicating the array.
 */
const REASONS = [
  { id: 'spam',           labelKey: 'report.reason.spam',           appliesTo: ['group', 'event', 'post'] as const },
  { id: 'inappropriate',  labelKey: 'report.reason.inappropriate',  appliesTo: ['group', 'event', 'post', 'user'] as const },
  { id: 'harassment',     labelKey: 'report.reason.harassment',     appliesTo: ['group', 'event', 'post', 'user'] as const },
  { id: 'misinformation', labelKey: 'report.reason.misinformation', appliesTo: ['group', 'event', 'post'] as const },
  { id: 'impersonation',  labelKey: 'report.reason.impersonation',  appliesTo: ['user'] as const },
  { id: 'other',          labelKey: 'report.reason.other',          appliesTo: ['group', 'event', 'post', 'user'] as const },
] as const;

/**
 * Phase 7.2 — supported report targets. The Firestore `reports`
 * collection rule is permissive on schema (`allow create: if
 * request.auth != null`), so adding new target types here is sufficient
 * — no security-rule change is required, and the admin reports
 * dashboard already partitions by `targetType` value.
 */
export type ReportTargetType = 'group' | 'event' | 'post' | 'user';

function reasonsForType(type: ReportTargetType) {
  return REASONS.filter((r) => (r.appliesTo as readonly string[]).includes(type));
}

// Title ("report.title") and prompt ("report.prompt") per target type: ICU selects in community.json.

interface ReportContentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetType: ReportTargetType;
  targetName: string;
  reporterId: string;
}

export default function ReportContentSheet({
  isOpen,
  onClose,
  targetId,
  targetType,
  targetName,
  reporterId,
}: ReportContentSheetProps) {
  const t = useT(community);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // enable_home_v2: the shared <Sheet>; flag off keeps the markup below untouched.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setLoading(true);
    console.log('[ReportContentSheet] Current user auth:', auth.currentUser?.uid ?? 'NOT SIGNED IN');
    const reportData = {
      targetId,
      targetType,
      targetName,
      reporterId,
      reason: selectedReason,
      status: 'pending',
    };
    console.log('[ReportContentSheet] Data to be sent:', reportData);
    try {
      await addDoc(collection(db, 'reports'), {
        ...reportData,
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('[ReportContentSheet] submit failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const visibleReasons = reasonsForType(targetType);
  const title = t('report.title', { type: targetType });
  const prompt = t('report.prompt', { type: targetType, name: targetName });

  const handleClose = () => {
    setSelectedReason(null);
    setSubmitted(false);
    onClose();
  };

  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={handleClose}
        // Community band: backdrop z-[92] / panel z-[93] (.cursorrules), in place.
        zIndex={SHEET_Z.communityPanel}
        backdropZIndex={SHEET_Z.community}
        portal={false}
        keyboardAware={false}
        backdropClassName="bg-black/50"
        backdropStyle={{ backdropFilter: 'blur(4px)' }}
        frameClassName="max-w-md mx-auto"
        transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
        scroll="none"
        ariaLabel={submitted ? t('report.sent') : title}
        header={
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-1">
            <h2 className="flex min-w-0 items-center gap-2 text-[22px] font-black !tracking-[-0.02em] text-v2-ink">
              {!submitted && <Flag className="h-5 w-5 shrink-0 text-v2-down" strokeWidth={2.4} />}
              <span className="truncate">{submitted ? t('report.sent') : title}</span>
            </h2>
            <IconButton aria-label={t('report.close')} tone="surface" size={36} className="shrink-0" onClick={handleClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        }
      >
        <div className="px-5 pb-4 pt-1">
          {submitted ? (
            <div className="flex flex-col items-center py-4 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40" aria-hidden>
                <Check className="h-7 w-7" strokeWidth={2.6} />
              </span>
              <p className="mt-3 max-w-[280px] text-[15px] font-bold leading-relaxed text-v2-ink-2">
                {t('report.thanks')}
              </p>
              <button type="button" onClick={handleClose} className={`mt-6 ${CONFIRM_ACTION_CLASS.secondary}`}>
                {t('report.done')}
              </button>
            </div>
          ) : (
            <>
              <p className="mb-4 text-[14px] font-bold text-v2-muted">
                {prompt}
              </p>
              <div className="mb-5 space-y-2">
                {visibleReasons.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReason(r.id)}
                    className={`w-full whitespace-nowrap rounded-[16px] px-4 py-3 text-right text-[15px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
                      selectedReason === r.id
                        ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
                        : 'bg-white text-v2-ink-2 shadow-v2-ring'
                    }`}
                  >
                    {t(r.labelKey)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!selectedReason || loading}
                onClick={handleSubmit}
                className={`flex items-center justify-center gap-2 ${CONFIRM_ACTION_CLASS.danger}`}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('report.submit')}
              </button>
            </>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[92] bg-black/50"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
            className="fixed bottom-0 left-0 right-0 z-[93] max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl"
          >
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mt-3" />

            <button
              onClick={handleClose}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
            >
              <X size={16} className="text-gray-500" />
            </button>

            <div className="px-6 pt-6 pb-10" dir="rtl">
              {submitted ? (
                <div className="text-center py-6">
                  <div className="text-5xl mb-3">✅</div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">
                    {t('report.sent')}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('report.thanks')}
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-6 w-full py-3 rounded-2xl text-sm font-bold text-gray-400"
                  >
                    {t('report.done')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <Flag className="w-5 h-5 text-red-500" />
                    <h3 className="text-lg font-black text-gray-900 dark:text-white">
                      {title}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                    {prompt}
                  </p>

                  <div className="space-y-2 mb-6">
                    {visibleReasons.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedReason(r.id)}
                        className={`w-full text-right px-4 py-3 rounded-2xl text-sm font-bold transition-all border ${
                          selectedReason === r.id
                            ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {t(r.labelKey)}
                      </button>
                    ))}
                  </div>

                  <button
                    disabled={!selectedReason || loading}
                    onClick={handleSubmit}
                    className="w-full py-3.5 rounded-2xl text-sm font-black bg-red-500 text-white disabled:opacity-40 flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                  >
                    {loading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : t('report.submit')
                    }
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
