'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, X, Loader2 } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

/**
 * Reason taxonomy.
 *
 * Phase 7.2 expansion: when reporting a *user* (not a piece of content),
 * the "ספאם" and "מידע מטעה" reasons make less sense as categories. We
 * gate them in `reasonsForType()` so the UI shows the right subset for
 * each target without duplicating the array.
 */
const REASONS = [
  { id: 'spam',           label: 'ספאם / תוכן מסחרי',  appliesTo: ['group', 'event', 'post'] as const },
  { id: 'inappropriate',  label: 'תוכן לא ראוי',        appliesTo: ['group', 'event', 'post', 'user'] as const },
  { id: 'harassment',     label: 'הטרדה או אלימות',    appliesTo: ['group', 'event', 'post', 'user'] as const },
  { id: 'misinformation', label: 'מידע מטעה',           appliesTo: ['group', 'event', 'post'] as const },
  { id: 'impersonation',  label: 'התחזות',              appliesTo: ['user'] as const },
  { id: 'other',          label: 'אחר',                 appliesTo: ['group', 'event', 'post', 'user'] as const },
];

/**
 * Phase 7.2 — supported report targets. The Firestore `reports`
 * collection rule is permissive on schema (`allow create: if
 * request.auth != null`), so adding new target types here is sufficient
 * — no security-rule change is required, and the admin reports
 * dashboard already partitions by `targetType` value.
 */
export type ReportTargetType = 'group' | 'event' | 'post' | 'user';

function reasonsForType(t: ReportTargetType) {
  return REASONS.filter((r) => (r.appliesTo as readonly string[]).includes(t));
}

const TARGET_LABEL: Record<ReportTargetType, string> = {
  group: 'הקבוצה',
  event: 'האירוע',
  post:  'הפוסט',
  user:  'המשתמש',
};

const PROMPT_BY_TYPE: Record<ReportTargetType, string> = {
  group: 'מדוע ברצונך לדווח על הקבוצה',
  event: 'מדוע ברצונך לדווח על האירוע',
  post:  'מדוע ברצונך לדווח על הפוסט של',
  user:  'מדוע ברצונך לדווח על המשתמש',
};

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
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
  const promptPrefix = PROMPT_BY_TYPE[targetType];

  const handleClose = () => {
    setSelectedReason(null);
    setSubmitted(false);
    onClose();
  };

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
                    הדיווח נשלח
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    תודה על שמירת הקהילה. נבדוק את הדיווח בהקדם.
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-6 w-full py-3 rounded-2xl text-sm font-bold text-gray-400"
                  >
                    סגור
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <Flag className="w-5 h-5 text-red-500" />
                    <h3 className="text-lg font-black text-gray-900 dark:text-white">
                      {`דיווח על ${TARGET_LABEL[targetType]}`}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                    {promptPrefix} &ldquo;{targetName}&rdquo;?
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
                        {r.label}
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
                      : 'שלח דיווח'
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
