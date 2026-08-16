'use client';

/**
 * OpponentPickerSheet — "בחר יריבה לקרב" bottom sheet for the Stage E
 * scope-vs-scope battle card (ScopeBattleCard). Your own entity is pinned
 * at the top, marked "קבוע" (fixed) — you can only change the opponent,
 * never yourself.
 *
 * Chrome (drag-to-dismiss motion, backdrop, header, rounded sheet) is
 * deliberately the same pattern as PartnerFilterSheet.tsx — reused for
 * design consistency per the earlier design-pass decision to reuse
 * existing sheet chrome rather than invent a new one. The DATA here is
 * unrelated to partner-finder; only the visual/interaction shell matches.
 */

import React from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import type { ScopeCompetitionEntry } from '@/features/arena/services/ranking.service';

const ACCENT = '#1D9E75';

interface OpponentPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  myEntry: ScopeCompetitionEntry;
  /** All other entries — myEntry is excluded by the caller, not filtered here. */
  candidates: ScopeCompetitionEntry[];
  selectedOpponentId: string | null;
  onSelect: (scopeId: string) => void;
}

export function OpponentPickerSheet({
  isOpen,
  onClose,
  myEntry,
  candidates,
  selectedOpponentId,
  onSelect,
}: OpponentPickerSheetProps) {
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
              <div style={{ width: 32 }} />
              <h2 className="text-base font-black text-gray-900">בחר יריבה לקרב</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform pointer-events-auto"
                aria-label="סגור"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>
            <p className="text-center text-[12px] text-gray-500 -mt-1 pb-3 px-5">
              אתה נשאר {myEntry.scopeName} — רק היריבה מתחלפת
            </p>

            <div className="px-5 pb-4 space-y-2 max-h-[55vh] overflow-y-auto">
              {/* My entity — pinned, not selectable */}
              <div
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: '#E1F5EE', border: `1px solid ${ACCENT}` }}
              >
                <div className="text-right">
                  <p className="text-sm font-black text-gray-900">{myEntry.scopeName}</p>
                  <p className="text-[11px] font-bold" style={{ color: ACCENT }}>
                    {myEntry.totalScore.toLocaleString('he-IL')}
                  </p>
                </div>
                <span
                  className="text-[10px] font-black px-2 py-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ACCENT, color: '#fff' }}
                >
                  📌 קבוע
                </span>
              </div>

              <div className="text-center text-[11px] text-gray-400 font-bold py-0.5">נגד:</div>

              {candidates.map((c) => {
                const selected = selectedOpponentId === c.scopeId;
                return (
                  <button
                    key={c.scopeId}
                    type="button"
                    onClick={() => { onSelect(c.scopeId); onClose(); }}
                    className="w-full flex items-center justify-between rounded-xl px-4 py-3 transition-colors"
                    style={{
                      border: selected ? `1.5px solid ${ACCENT}` : '0.5px solid #E5E7EB',
                      backgroundColor: selected ? '#F0FBF6' : '#fff',
                    }}
                  >
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{c.scopeName}</p>
                      <p className="text-[11px] text-gray-500 tabular-nums">
                        {c.rank === 1 ? 'המקום הראשון' : `מקום #${c.rank}`} · {c.totalScore.toLocaleString('he-IL')}
                      </p>
                    </div>
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{
                        border: `2px solid ${selected ? ACCENT : '#D1D5DB'}`,
                        backgroundColor: selected ? ACCENT : 'transparent',
                      }}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default OpponentPickerSheet;
