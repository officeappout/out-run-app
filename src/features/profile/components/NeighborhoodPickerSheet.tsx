'use client';

/**
 * NeighborhoodPickerSheet — dedicated שכונה picker for /profile, constrained
 * to the user's own city (never a global search across every city's
 * neighborhoods). Pure UI + selection callback — same convention as
 * OpponentPickerSheet: the sheet doesn't write to Firestore itself, the
 * caller does, so data-mutation logic stays in one place (profile/page.tsx).
 *
 * Chrome (drag-to-dismiss motion, header layout, "X") is the same reused
 * pattern as every other bottom sheet built this session
 * (PartnerFilterSheet → OpponentPickerSheet/LeagueFilterSheet).
 *
 * Neighborhood list is real live data: getChildrenByParent(cityAuthorityId)
 * — the exact same query the onboarding location step's
 * findNeighborhoodIdByCity already uses (authorities where
 * parentAuthorityId == cityAuthorityId). Reused, not reimplemented, so this
 * picker can never resolve a different ID than onboarding would for the
 * same name.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { getChildrenByParent } from '@/features/admin/services/authority.service';
import type { Authority } from '@/types/admin-types';

const ACCENT = '#00ADEF';

interface NeighborhoodPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  cityAuthorityId: string | null;
  cityName?: string | null;
  currentNeighborhoodId: string | null;
  onSelect: (neighborhood: Authority) => void;
}

export function NeighborhoodPickerSheet({
  isOpen,
  onClose,
  cityAuthorityId,
  cityName,
  currentNeighborhoodId,
  onSelect,
}: NeighborhoodPickerSheetProps) {
  const dragControls = useDragControls();
  const [neighborhoods, setNeighborhoods] = useState<Authority[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen || !cityAuthorityId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(false);
    getChildrenByParent(cityAuthorityId)
      .then((children) => { if (!cancelled) setNeighborhoods(children); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, cityAuthorityId]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            // z-[70] — NOT the z-[48] used by this sheet's arena/partners
            // siblings (PartnerFilterSheet/OpponentPickerSheet/LeagueFilterSheet),
            // which only need to clear a z-[45] overlay in that context. This
            // sheet is launched from inside SettingsModal (z-50) — z-[48]
            // rendered it BEHIND the modal that opens it. Matches
            // EquipmentFilterSheet (z-70/71), SettingsModal's other sibling
            // sheet with the identical role.
            className="fixed inset-0 bg-black/40 z-[70] pointer-events-auto"
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
            className="fixed bottom-0 left-0 right-0 z-[71] bg-white rounded-t-3xl shadow-2xl pointer-events-auto max-w-md mx-auto"
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
              <h2 className="text-base font-black text-gray-900">בחר שכונה</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform pointer-events-auto"
                aria-label="סגור"
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>
            {cityName && (
              <p className="text-center text-[12px] text-gray-500 -mt-1 pb-3 px-5">ב{cityName}</p>
            )}

            <div className="px-5 pb-4 space-y-2 max-h-[55vh] overflow-y-auto">
              {isLoading && (
                <div className="py-8 text-center text-sm text-gray-400">טוען שכונות...</div>
              )}

              {!isLoading && error && (
                <div className="py-8 text-center text-sm text-gray-400">שגיאה בטעינת רשימת השכונות</div>
              )}

              {!isLoading && !error && neighborhoods.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm font-bold text-gray-700">עדיין אין שכונות מוגדרות ל{cityName ?? 'העיר שלך'}</p>
                  <p className="text-xs text-gray-400 mt-1">נעדכן ברגע שיתווספו</p>
                </div>
              )}

              {!isLoading && !error && neighborhoods.map((n) => {
                const selected = currentNeighborhoodId === n.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => { onSelect(n); onClose(); }}
                    className="w-full flex items-center justify-between rounded-xl px-4 py-3 transition-colors"
                    style={{
                      border: selected ? `1.5px solid ${ACCENT}` : '0.5px solid #E5E7EB',
                      backgroundColor: selected ? '#EAF6FF' : '#fff',
                    }}
                  >
                    <span className="text-sm font-bold text-gray-900">{n.name}</span>
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

export default NeighborhoodPickerSheet;
