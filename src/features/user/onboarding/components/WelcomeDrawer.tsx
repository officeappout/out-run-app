'use client';

/**
 * WelcomeDrawer — tutorial entry mechanism, slice 1 (06.10.2026).
 *
 * "ברוכים הבאים — מה בא לך?" — a bottom-sheet with exactly 2 options,
 * routed into EXISTING flows (never a parallel system):
 *   1. אימון כוח מותאם → parent calls the existing `handleHeroPress()`
 *      (home/page.tsx) — zero new navigation logic.
 *   2. Geo-aware second option — copy + destination both depend on
 *      `geoBranch` (resolved by useEntryRouter's Gate 2):
 *        - 'none'    → `/map?openRun=walking`, a fully EXISTING deep link
 *          (DiscoverLayer.tsx's initialOpenRun handling opens the free-
 *          cardio drawer directly) — zero new map-file code.
 *        - 'gardens' / 'routes' → plain `/map` for THIS slice. Auto-
 *          triggering the hybrid-slots carousel or the curated-route
 *          carousel would need new logic inside MapShell.tsx/
 *          DiscoverLayer.tsx, which are David's owned map/nav files — not
 *          touched here without his separate go (see the PR description).
 *
 * Purely presentational — every destination/callback is supplied by the
 * caller (home/page.tsx) so this component owns no navigation itself.
 */

import { motion } from 'framer-motion';
import { Dumbbell, MapPin, X } from 'lucide-react';
import type { EntryRouterGeoBranch } from '../hooks/useEntryRouter';

interface WelcomeDrawerProps {
  geoBranch: EntryRouterGeoBranch;
  onStrengthProgram: () => void;
  onSecondaryOption: () => void;
  onSkipToMap: () => void;
}

const SECONDARY_COPY: Record<EntryRouterGeoBranch, { title: string; subtitle: string }> = {
  gardens: {
    title: 'אימון היברידי בגינת כושר קרובה',
    subtitle: 'מצאנו לך מתחם עם מתקנים באזור שלך',
  },
  routes: {
    title: 'מסלול ריצה מוכן באזור שלך',
    subtitle: 'מסלול מתוכנן ומוכן להתחלה',
  },
  none: {
    title: 'ריצה או הליכה חופשית',
    subtitle: 'נתחיל במיקום שלך, בלי צורך בציוד',
  },
};

export default function WelcomeDrawer({
  geoBranch,
  onStrengthProgram,
  onSecondaryOption,
  onSkipToMap,
}: WelcomeDrawerProps) {
  const secondary = SECONDARY_COPY[geoBranch];

  return (
    <div className="fixed inset-0 z-[101] flex items-end justify-center" dir="rtl">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onSkipToMap}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative z-10 w-full max-w-lg mx-auto bg-white rounded-t-3xl shadow-2xl px-6 pt-5 pb-8"
      >
        <button
          onClick={onSkipToMap}
          aria-label="דלג למפה"
          className="absolute left-4 top-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
        >
          <X size={16} />
        </button>

        <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-5" />

        <h2 className="text-xl font-black text-slate-900 text-center mb-1">
          ברוכים הבאים ל-OUT
        </h2>
        <p className="text-slate-500 font-medium text-center mb-6">
          מה בא לך לעשות?
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={onStrengthProgram}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-l from-[#5BC2F2] to-[#3BA4D8] text-white shadow-lg shadow-cyan-500/30 active:scale-[0.98] transition-transform"
          >
            <span className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Dumbbell size={22} />
            </span>
            <span className="text-right flex-1">
              <span className="block font-bold text-base leading-tight">אימון כוח מותאם</span>
              <span className="block text-sm opacity-90">תוכנית בנויה בשבילך, לפי הרמה שלך</span>
            </span>
          </button>

          <button
            onClick={onSecondaryOption}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 active:scale-[0.98] transition-transform"
          >
            <span className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
              <MapPin size={22} className="text-[#3BA4D8]" />
            </span>
            <span className="text-right flex-1">
              <span className="block font-bold text-base leading-tight text-slate-900">{secondary.title}</span>
              <span className="block text-sm text-slate-500">{secondary.subtitle}</span>
            </span>
          </button>
        </div>

        <button
          onClick={onSkipToMap}
          className="w-full text-center text-sm font-semibold text-slate-400 mt-5"
        >
          דלג, רק תראו לי את המפה
        </button>
      </motion.div>
    </div>
  );
}
