'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// ── Layer 3: Plan Realign (7-21 day gap) ─────────────────────────────

interface PlanRealignPopupProps {
  open: boolean;
  onContinue: () => void;
  onBackOneWeek: () => void;
  onReset: () => void;
  onClose: () => void;
}

export function PlanRealignPopup({
  open,
  onContinue,
  onBackOneWeek,
  onReset,
  onClose,
}: PlanRealignPopupProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full max-w-md bg-white rounded-t-3xl z-10"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            dir="rtl"
          >
            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <X size={16} className="text-gray-500" />
            </button>

            <div className="px-6 pt-8 pb-2">
              <div className="text-center mb-2">
                <span className="text-4xl">💪</span>
              </div>
              <h2 className="text-xl font-black text-gray-900 text-center mb-2">
                שמחים שחזרת!
              </h2>
              <p className="text-sm text-gray-500 text-center leading-relaxed mb-6">
                ראינו שלקחת הפסקה קצרה. איך היית רוצה להמשיך את התוכנית?
              </p>

              <div className="space-y-3">
                <button
                  onClick={onContinue}
                  className="w-full py-3.5 rounded-xl text-base font-bold text-white active:scale-[0.97] transition-transform"
                  style={{ background: '#00BAF7' }}
                >
                  להמשיך כרגיל
                </button>
                <button
                  onClick={onBackOneWeek}
                  className="w-full py-3.5 rounded-xl text-base font-bold text-[#00BAF7] bg-sky-50 active:scale-[0.97] transition-transform"
                >
                  לחזור שבוע אחורה
                </button>
                <button
                  onClick={onReset}
                  className="w-full py-3.5 rounded-xl text-base font-bold text-gray-500 bg-gray-100 active:scale-[0.97] transition-transform"
                >
                  אפס תוכנית
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Layer 4: Rebuild (21+ day gap) ───────────────────────────────────

interface RebuildPopupProps {
  open: boolean;
  onRebuild: () => void;
  onContinue: () => void;
  onClose: () => void;
}

export function RebuildPopup({
  open,
  onRebuild,
  onContinue,
  onClose,
}: RebuildPopupProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="relative w-full max-w-md bg-white rounded-t-3xl z-10"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            dir="rtl"
          >
            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <X size={16} className="text-gray-500" />
            </button>

            <div className="px-6 pt-8 pb-2">
              <div className="text-center mb-2">
                <span className="text-4xl">🏃</span>
              </div>
              <h2 className="text-xl font-black text-gray-900 text-center mb-2">
                ברוכים השבים!
              </h2>
              <p className="text-sm text-gray-500 text-center leading-relaxed mb-6">
                עבר קצת זמן מאז האימון האחרון. כדי למנוע פציעות, כדאי להתאים את התוכנית מחדש לכושר הנוכחי שלך.
              </p>

              <div className="space-y-3">
                <button
                  onClick={onRebuild}
                  className="w-full py-3.5 rounded-xl text-base font-bold text-white active:scale-[0.97] transition-transform"
                  style={{ background: '#00BAF7' }}
                >
                  בנה לי תוכנית מעודכנת
                </button>
                <button
                  onClick={onContinue}
                  className="w-full py-3.5 rounded-xl text-base font-bold text-gray-500 bg-gray-100 active:scale-[0.97] transition-transform"
                >
                  אני בסדר, פשוט תמשיך
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
