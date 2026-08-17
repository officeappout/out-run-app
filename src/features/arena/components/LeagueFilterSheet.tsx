'use client';

/**
 * LeagueFilterSheet — secondary filters bottom sheet for leagues (מגדר only
 * — see below for why age/activity-type aren't here despite being asked
 * for; this was scoped down after investigating, not a partial build).
 *
 * Chrome (drag-to-dismiss motion, header layout, "אפס"/"X", gender pill
 * styling/colors) is deliberately copied from
 * src/features/partners/components/PartnerFilterSheet.tsx — reused for
 * design consistency, same convention as OpponentPickerSheet reusing the
 * same drag-to-dismiss pattern from the same source. The DATA here is
 * unrelated to partner-finder: this reads/writes the page-level
 * leaderboardGender state (LeaderboardGenderFilter, already wired through
 * every leaderboard query end-to-end) via props, NOT usePartnerFilters
 * (a different domain's persisted Zustand store — genderFilter there means
 * "which gender of partner to show me", a different axis entirely).
 *
 * "החל" simply closes the sheet — genderFilter is already applied live via
 * the parent's own state on every pill tap, same "no local mirror state"
 * convention as PartnerFilterSheet.
 *
 * Default is 'all' (no filter, everyone shown) — critical while the user
 * base is small; a narrowed board on a near-empty league reads as broken,
 * not filtered. Users opt in via this sheet.
 */

import React from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import type { LeaderboardGenderFilter } from '@/features/arena/services/ranking.service';

const ACCENT = '#00ADEF';

interface LeagueFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  genderFilter: LeaderboardGenderFilter;
  onGenderFilterChange: (value: LeaderboardGenderFilter) => void;
}

const GENDER_PILLS: { value: LeaderboardGenderFilter; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'male', label: 'גברים' },
  { value: 'female', label: 'נשים' },
];

export function LeagueFilterSheet({ isOpen, onClose, genderFilter, onGenderFilterChange }: LeagueFilterSheetProps) {
  const dragControls = useDragControls();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
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
            className="fixed bottom-0 left-0 right-0 z-[49] bg-white rounded-t-3xl shadow-2xl pointer-events-auto max-w-md mx-auto"
            dir="rtl"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 56px)' }}
          >
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
            </div>

            <div className="flex items-center justify-between px-5 pb-3">
              <button
                type="button"
                onClick={() => onGenderFilterChange('all')}
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

            <div className="px-5 pb-4 space-y-5">
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
                        onClick={() => onGenderFilterChange(p.value)}
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
            </div>

            <div className="px-5 pt-2 pb-4">
              <button
                type="button"
                onClick={onClose}
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

export default LeagueFilterSheet;
