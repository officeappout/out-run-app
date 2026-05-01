'use client';

/**
 * PartnerFilterSheet — bottom sheet that exposes the long-tail filter
 * controls (distance, gender, age range) that don't fit on the pill bar.
 * Drag-to-dismiss interaction:
 *   - `useDragControls` + `dragListener={false}` to scope dragging to the
 *     header handle so users can scroll the body without dismissing.
 *   - `onDragEnd`: dismiss on offset > 80 OR velocity > 300.
 *   - Spring transition: damping 28, stiffness 300.
 *
 * Gender lives here (not on the pill bar) so the bar stays focused on
 * activity / program / time selection — gender is a "settings"-style
 * filter most users set once.
 *
 * Level range is intentionally NOT in this sheet — it lives on
 * PartnerFilterBar Row 4 (only visible when activity=strength + program
 * selected) where the level bounds are program-specific, so duplicating
 * a generic 1–10 slider here would conflict with that contextual one.
 *
 * All values are read/written from `usePartnerFilters` directly — no local
 * mirror state. "החל" simply closes the sheet (the values are already
 * persisted by the store on each change).
 */

import React from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { usePartnerFilters, type GenderFilter } from '../hooks/usePartnerFilters';
import { DualRangeSlider } from './DualRangeSlider';

interface PartnerFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Fires when the user explicitly taps "החל" (in addition to the
   * implicit `onClose` that always runs). Allows callers to distinguish
   * an Apply-and-close from a passive dismiss (X / drag / backdrop tap)
   * — used by `MapLayersControl` to flip `liveUsersVisible` on only
   * when the user actively committed to a filter selection.
   */
  onApply?: () => void;
}

const ACCENT = '#00ADEF';

// Distance bounds — kept in sync with the slider props so the fill width
// stays correct if either changes.
const DISTANCE_MIN = 0.5;
const DISTANCE_MAX = 15;

export function PartnerFilterSheet({ isOpen, onClose, onApply }: PartnerFilterSheetProps) {
  const dragControls = useDragControls();

  const distanceKm = usePartnerFilters((s) => s.distanceKm);
  const setDistanceKm = usePartnerFilters((s) => s.setDistanceKm);
  const genderFilter = usePartnerFilters((s) => s.genderFilter);
  const setGenderFilter = usePartnerFilters((s) => s.setGenderFilter);
  const ageRange = usePartnerFilters((s) => s.ageRange);
  const setAgeRange = usePartnerFilters((s) => s.setAgeRange);
  const reset = usePartnerFilters((s) => s.reset);

  const GENDER_PILLS: { value: GenderFilter; label: string }[] = [
    { value: 'all', label: 'הכל' },
    { value: 'male', label: 'גברים' },
    { value: 'female', label: 'נשים' },
  ];

  const formatDistance = (v: number) => (v < 1 ? `${Math.round(v * 1000)} מ׳` : `${v} ק״מ`);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* z-[48] / z-[49] keep the sheet ABOVE the PartnerOverlay (z-[45])
              when it's opened from inside the overlay, and BELOW the
              BottomNavbar (z-50) so the nav stays on top and tappable. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[48] pointer-events-auto"
          />

          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 300) onClose();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[49] bg-white rounded-t-3xl shadow-2xl pointer-events-auto"
            dir="rtl"
            // 56px = BottomNavbar height. The nav sits at z-50 (above this
            // sheet at z-[49]) and would otherwise occlude the bottom of
            // the sheet — the "החל" CTA disappeared behind it. Same fix
            // pattern as PartnerOverlay's inner content paddingBottom.
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 56px)' }}
          >
            {/* Drag handle */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3">
              <button
                type="button"
                onClick={reset}
                className="text-[13px] font-bold text-gray-500 active:text-gray-700 pointer-events-auto"
              >
                אפס
              </button>
              <h2 className="text-base font-black text-gray-900">פילטרים</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform pointer-events-auto"
                aria-label="סגור"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>

            <div className="px-5 pb-4 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Section 1 — Distance */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-black text-gray-800">מרחק</span>
                  <span className="text-[13px] font-black" style={{ color: ACCENT }}>
                    עד {formatDistance(distanceKm)}
                  </span>
                </div>
                {/* Wrapped track: gray rail + accent fill from the right edge
                    (DISTANCE_MIN) to the thumb. Native <input> rides on top
                    with a transparent track so only the thumb shows; dir="rtl"
                    keeps the small-on-right convention used in PartnerFilterBar. */}
                <div className="relative w-full" style={{ height: 16 }}>
                  <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 bg-gray-200 rounded-full" />
                  <div
                    className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                    style={{
                      right: 0,
                      left: `${100 - ((distanceKm - DISTANCE_MIN) / (DISTANCE_MAX - DISTANCE_MIN)) * 100}%`,
                      backgroundColor: ACCENT,
                    }}
                  />
                  <input
                    type="range"
                    min={DISTANCE_MIN}
                    max={DISTANCE_MAX}
                    step={0.5}
                    value={distanceKm}
                    dir="rtl"
                    onChange={(e) => setDistanceKm(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer"
                    style={{ accentColor: ACCENT }}
                    aria-label="מרחק חיפוש בקילומטרים"
                  />
                </div>
              </section>

              {/* Section 2 — Gender (pills, single-select with 'all' fallback) */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-black text-gray-800">מגדר</span>
                </div>
                <div className="flex gap-2">
                  {GENDER_PILLS.map((p) => {
                    const active = genderFilter === p.value;
                    return (
                      <button
                        key={`gender_${p.value}`}
                        type="button"
                        onClick={() => setGenderFilter(p.value)}
                        className="flex-1 rounded-full text-[13px] font-bold transition-colors active:scale-95"
                        style={{
                          height: 36,
                          backgroundColor: active ? ACCENT : '#FFFFFF',
                          color: active ? '#FFFFFF' : '#4B5563',
                          border: active ? 'none' : '0.5px solid rgba(0,0,0,0.12)',
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Section 3 — Age range (single dual-handle slider) */}
              <section>
                <div className="mb-2">
                  <span className="text-[13px] font-black text-gray-800">טווח גילאים</span>
                </div>
                <DualRangeSlider
                  min={18}
                  max={99}
                  step={1}
                  values={ageRange}
                  onChange={setAgeRange}
                  ariaLabelMin="גיל מינימום"
                  ariaLabelMax="גיל מקסימום"
                />
                {/* Edge labels — under RTL `flex justify-between`, the first
                    child sits on the right (younger end) and the second on
                    the left (older end). */}
                <div className="flex justify-between" style={{ fontSize: 10, color: '#9CA3AF' }}>
                  <span>צעיר</span>
                  <span>מבוגר</span>
                </div>
              </section>
            </div>

            {/* Apply CTA */}
            <div className="px-5 pt-2 pb-4">
              <button
                type="button"
                onClick={() => {
                  onApply?.();
                  onClose();
                }}
                className="w-full py-3 text-white text-sm font-black active:scale-[0.98] transition-transform shadow-sm pointer-events-auto"
                style={{ backgroundColor: ACCENT, borderRadius: 12 }}
              >
                החל
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default PartnerFilterSheet;
