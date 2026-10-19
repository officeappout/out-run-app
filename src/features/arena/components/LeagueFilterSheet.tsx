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
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import Sheet from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';

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
  // enable_home_v2: the shared <Sheet>; flag off keeps the markup below untouched.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        // Backdrop z-[48] / panel z-[49] (.cursorrules), in place — unchanged.
        zIndex={SHEET_Z.arenaFilterPanel}
        backdropZIndex={SHEET_Z.arenaFilter}
        portal={false}
        keyboardAware={false}
        backdropClassName="bg-black/40 pointer-events-auto"
        frameClassName="pointer-events-auto max-w-md mx-auto"
        safeArea="calc(env(safe-area-inset-bottom, 0px) + 56px)"
        scroll="none"
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        dragToDismiss={{ distance: 80, velocity: 300, elastic: 0.25 }}
        grabberClassName="flex justify-center pt-3 pb-2"
        ariaLabel="פילטרים"
        header={
          <div className="flex items-center justify-between gap-3 px-5 pb-3">
            <h2 className="whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">פילטרים</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onGenderFilterChange('all')}
                className="h-9 whitespace-nowrap rounded-full px-3 text-[13px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]"
              >
                אפס
              </button>
              <IconButton aria-label="סגור" tone="surface" size={36} onClick={onClose}>
                <X size={16} className="text-v2-ink-2" />
              </IconButton>
            </div>
          </div>
        }
        footer={
          <div className="px-5 pt-2 pb-4">
            <button
              type="button"
              onClick={onClose}
              className="h-12 w-full whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              החל
            </button>
          </div>
        }
      >
        <div className="px-5 pb-4 pt-1">
          <section>
            <span className="mb-2.5 block whitespace-nowrap text-[15px] font-black text-v2-ink">מגדר</span>
            <div className="flex gap-2">
              {GENDER_PILLS.map((p) => {
                const active = genderFilter === p.value;
                return (
                  <button
                    key={`gender_${p.value}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onGenderFilterChange(p.value)}
                    className={`h-10 flex-1 whitespace-nowrap rounded-full text-[14px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
                      active ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </section>
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
