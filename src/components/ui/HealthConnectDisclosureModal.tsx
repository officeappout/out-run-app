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
import { ShieldCheck, Footprints, Flame, Timer, X, ExternalLink } from 'lucide-react';
import LegalDocModal from '@/features/legal/components/LegalDocModal';

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
    icon: <Footprints size={18} className="text-[#5BC2F2]" aria-hidden="true" />,
    label: 'צעדים יומיים',
    purpose: 'מעקב אחר יעד הצעדים היומי שלך',
    access: 'קריאה',
  },
  {
    icon: <Flame size={18} className="text-orange-400" aria-hidden="true" />,
    label: 'קלוריות פעילות',
    purpose: 'הצגת קלוריות שנשרפו בפעילות גופנית',
    access: 'קריאה',
  },
  {
    icon: <Timer size={18} className="text-emerald-500" aria-hidden="true" />,
    label: 'דקות פעילות (Exercise Time)',
    purpose: 'מעקב אחר עמידה ביעד 150 דקות WHO',
    access: 'קריאה + כתיבה',
  },
] as const;

export default function HealthConnectDisclosureModal({
  isOpen,
  onConfirm,
  onDismiss,
  platformLabel = 'HealthKit / Health Connect',
}: HealthConnectDisclosureModalProps) {
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="hc-disclosure-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-sm"
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
                    גישה לנתוני בריאות
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label="סגור"
                  className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <X size={18} className="text-slate-500" />
                </button>
              </div>

              <div className="px-5 pb-6 space-y-5">
                {/* ── Platform label ── */}
                <p className="text-xs text-slate-500 leading-relaxed">
                  OUT מבקשת גישה ל
                  <span className="font-semibold text-slate-700"> {platformLabel} </span>
                  כדי להציג לך נתוני פעילות אישיים. להלן פירוט מדויק של מה שנקרא ולמה:
                </p>

                {/* ── Data items table ── */}
                <div className="space-y-2.5">
                  {DATA_ITEMS.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-start gap-3 bg-slate-50 rounded-xl px-3.5 py-3"
                    >
                      <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 leading-snug">
                          {item.label}
                          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            ({item.access})
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          {item.purpose}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Commitment box ── */}
                <div className="bg-emerald-50 border border-emerald-200/70 rounded-xl px-4 py-3.5 space-y-1.5">
                  <p className="text-xs font-bold text-emerald-800">
                    ההתחייבויות שלנו:
                  </p>
                  <ul className="space-y-1 text-xs text-emerald-700 leading-relaxed list-none">
                    <li>✓ נתוני הבריאות משמשים אך ורק להצגה אישית עבורך</li>
                    <li>✓ לא מועברים לצדדים שלישיים, ספקי פרסום או חברות ביטוח</li>
                    <li>✓ לא נשמרים בשרתי OUT — מוצגים ישירות מהמכשיר</li>
                    <li>✓ ניתן לבטל גישה בכל עת דרך הגדרות הטלפון</li>
                  </ul>
                </div>

                {/* ── Privacy policy link ── */}
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(true)}
                  className="flex items-center gap-1.5 text-xs text-[#5BC2F2] hover:text-[#4AADE3] transition-colors"
                >
                  <ExternalLink size={12} />
                  <span>קרא/י את מדיניות הפרטיות המלאה (סעיף 2)</span>
                </button>

                {/* ── CTAs ── */}
                <div className="flex flex-col gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={onConfirm}
                    className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] active:scale-[0.98] text-white font-bold py-3.5 rounded-2xl shadow-md shadow-[#5BC2F2]/20 transition-all text-sm"
                  >
                    אפשר גישה
                  </button>
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="w-full text-slate-500 font-medium py-2.5 rounded-2xl hover:bg-slate-50 transition-colors text-sm"
                  >
                    לא עכשיו
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full privacy policy modal — opened from the link inside this disclosure */}
      <LegalDocModal
        type="privacy"
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
      />
    </>
  );
}
