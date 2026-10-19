'use client';

import React from 'react';
import { motion } from 'framer-motion';

// ════════════════════════════════════════════════════════════════════
// EXISTING-ACCOUNT MODAL
// ════════════════════════════════════════════════════════════════════
//
// P0-4 (25.09.2026, see docs/audit-2026-09/00-MASTER-PLAN.md §13.24):
// shown when an anonymous guest's link attempt fails with
// 'google_account_exists'/'apple_account_exists' — that Google/Apple
// identity is already a real account under a DIFFERENT uid. David,
// explicit product decision: offer to sign into the existing account,
// never block. Nothing about the current guest session changes until
// the user explicitly confirms — cancel is a true no-op, same state as
// before the button was ever pressed. z-[101] — this page's own branded
// splash is already z-[100] (src/app/page.tsx), and OfflineBanner is
// globally mounted at z-[100] too (ClientLayout, can appear at any time
// on connectivity change) — z-[101] is the existing documented tier for
// exactly this ("clear OfflineBanner", .cursorrules Z-Index Budget),
// not a new value.
export default function ExistingAccountModal({
  provider,
  loading,
  onConfirm,
  onCancel,
}: {
  provider: 'google' | 'apple';
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const providerLabel = provider === 'google' ? 'Google' : 'Apple';
  return (
    <div
      className="fixed inset-0 z-[101] bg-black/50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
      >
        <h3
          className="text-lg font-bold text-slate-900 mb-2"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          החשבון הזה כבר רשום אצלנו
        </h3>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          אפשר להיכנס לחשבון ה-{providerLabel} הקיים, אבל מה שעשית עכשיו
          כאורח לא יעבור לשם.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="w-full bg-brand-cta hover:brightness-105 text-on-brand py-3.5 rounded-2xl font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? 'מתחבר...' : `כניסה לחשבון ה-${providerLabel} הקיים`}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full bg-slate-100 text-slate-600 py-3.5 rounded-2xl font-bold text-sm hover:bg-slate-200 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            ביטול
          </button>
        </div>
      </motion.div>
    </div>
  );
}
