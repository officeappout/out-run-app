'use client';

/**
 * WelcomeDrawer — tutorial entry mechanism, slice 1 (06.10.2026).
 *
 * "ברוכים הבאים — מה בא לך?" — a bottom-sheet with exactly 2 options,
 * routed into EXISTING flows (never a parallel system):
 *   1. אימון כוח מותאם → parent calls the existing `handleHeroPress()`
 *      (home/page.tsx) — zero new navigation logic.
 *   2. Geo-aware second option — copy + destination both depend on
 *      `geoBranch` (resolved by useEntryRouter's Gate 2), each a one-shot
 *      map deep-link (home/page.tsx's `onSecondaryOption` owns the actual
 *      URLs): `openRun=walking` (pre-existing), `openHybridSlots=1` /
 *      `openDiscover=1` (geo-branch auto-trigger fast-follow, 06.10.2026 —
 *      see MapShell.tsx/DiscoverLayer.tsx, David's owned map/nav files,
 *      touched only after his explicit go for this specific fast-follow).
 *
 * Purely presentational — every destination/callback is supplied by the
 * caller (home/page.tsx) so this component owns no navigation itself.
 */

import { motion } from 'framer-motion';
import { ChevronLeft, Dumbbell, Footprints, MapPin, Route, Trees, X, type LucideIcon } from 'lucide-react';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import { useUserStore } from '../../identity/store/useUserStore';
import { g, type AppGender } from '@/lib/utils/gendered-text';
import type { EntryRouterGeoBranch } from '../hooks/useEntryRouter';

interface WelcomeDrawerProps {
  geoBranch: EntryRouterGeoBranch;
  onStrengthProgram: () => void;
  onSecondaryOption: () => void;
  onSkipToMap: () => void;
  /** v2 only (slice 2, 17.10.2026): the quiet third option "סתם בא לי להסתכל באפליקציה" —
   *  stays on home and starts the home coach-mark tour. Omitted → the link isn't rendered. */
  onJustLook?: () => void;
}

/** v2 icon + activity colour for the geo-aware second card (design language v2 activity colours). */
const SECONDARY_ICON_V2: Record<EntryRouterGeoBranch, { icon: LucideIcon; tile: string }> = {
  gardens: { icon: Trees, tile: 'bg-[#84cc16]/10 text-[#65a30d]' },
  routes: { icon: Route, tile: 'bg-[#84cc16]/10 text-[#65a30d]' },
  none: { icon: Footprints, tile: 'bg-[#f59e0b]/10 text-[#b45309]' },
};

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
  onJustLook,
}: WelcomeDrawerProps) {
  const v2 = useHomeV2();
  const gender = useUserStore((s) => s.profile?.core?.gender) as AppGender | undefined;
  const secondary = SECONDARY_COPY[geoBranch];

  if (v2) {
    const sec = SECONDARY_ICON_V2[geoBranch];
    const SecIcon = sec.icon;
    const card =
      'flex w-full items-center gap-3.5 rounded-[20px] bg-white p-4 text-right shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]';
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
          className="relative z-10 mx-auto w-full max-w-lg rounded-t-[28px] bg-white px-5 pt-3 shadow-v2-sheet"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 24px))' }}
        >
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-v2-pill-border" />

          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">
                {g(gender, 'ברוך הבא ל-OUT', 'ברוכה הבאה ל-OUT', 'ברוכים הבאים ל-OUT')}
              </p>
              <h2 className="mt-1 text-[22px] font-black leading-tight !tracking-[-0.02em] text-v2-ink">
                מה הדבר הראשון שבא לך לעשות?
              </h2>
            </div>
            <button
              type="button"
              onClick={onSkipToMap}
              aria-label="דלג למפה"
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-v2-surface text-v2-ink ring-1 ring-inset ring-v2-hairline"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <button type="button" onClick={onStrengthProgram} className={card}>
              <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-[14px] bg-[#00baf7]/10 text-[#0284c7]">
                <Dumbbell size={24} strokeWidth={2.4} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-black text-v2-ink">אימון כוח מותאם</span>
                <span className="mt-0.5 block text-[13px] font-bold leading-snug text-v2-muted">תוכנית בנויה בשבילך, לפי הרמה שלך</span>
              </span>
              <ChevronLeft size={18} className="flex-shrink-0 text-v2-muted" aria-hidden />
            </button>

            <button type="button" onClick={onSecondaryOption} className={card}>
              <span className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-[14px] ${sec.tile}`}>
                <SecIcon size={24} strokeWidth={2.4} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-black text-v2-ink">{secondary.title}</span>
                <span className="mt-0.5 block text-[13px] font-bold leading-snug text-v2-muted">{secondary.subtitle}</span>
              </span>
              <ChevronLeft size={18} className="flex-shrink-0 text-v2-muted" aria-hidden />
            </button>
          </div>

          {onJustLook && (
            <button
              type="button"
              onClick={onJustLook}
              className="mx-auto mt-4 block whitespace-nowrap px-3 py-2 text-center text-[14px] font-bold text-v2-muted transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              סתם בא לי להסתכל באפליקציה
            </button>
          )}
        </motion.div>
      </div>
    );
  }

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
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-l from-[#5BC2F2] to-[#3BA4D8] text-on-brand shadow-lg shadow-cyan-500/30 active:scale-[0.98] transition-transform"
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
