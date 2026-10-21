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
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import Sheet from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';

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
  const t = useT(profileNs);
  const dragControls = useDragControls();
  const [neighborhoods, setNeighborhoods] = useState<Authority[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  // enable_home_v2: the shared <Sheet>; flag off keeps the markup below untouched.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

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

  const list = (
    <div className="px-5 pb-4 space-y-2 max-h-[55vh] overflow-y-auto">
      {isLoading && (
        <div className="py-8 text-center text-sm text-gray-400">{t('profile.neighborhood.loading')}</div>
      )}

      {!isLoading && error && (
        <div className="py-8 text-center text-sm text-gray-400">{t('profile.neighborhood.error')}</div>
      )}

      {!isLoading && !error && neighborhoods.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm font-bold text-gray-700">
            {cityName != null ? t('profile.neighborhood.empty.city', { city: cityName }) : t('profile.neighborhood.empty.noCity')}
          </p>
          <p className="text-xs text-gray-400 mt-1">{t('profile.neighborhood.empty.hint')}</p>
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
  );

  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        // Backdrop z-[70] / panel z-[71] (.cursorrules) — clears SettingsModal
        // (z-50), which opens it; in place, unchanged.
        zIndex={SHEET_Z.filterPanel}
        backdropZIndex={SHEET_Z.filter}
        portal={false}
        keyboardAware={false}
        backdropClassName="bg-black/40 pointer-events-auto"
        backdropStyle={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        frameClassName="pointer-events-auto max-w-md mx-auto"
        safeArea="calc(env(safe-area-inset-bottom, 0px) + 56px)"
        scroll="none"
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        dragToDismiss={{ distance: 80, velocity: 300, elastic: 0.25 }}
        grabberClassName="flex justify-center pt-3 pb-2"
        ariaLabel={t('profile.neighborhood.title')}
        header={
          <div className="flex items-center justify-between gap-3 px-5 pb-3">
            <div className="min-w-0">
              <h2 className="whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{t('profile.neighborhood.title')}</h2>
              {cityName && <p className="truncate text-[12.5px] font-bold text-v2-muted">{t('profile.neighborhood.inCity', { city: cityName })}</p>}
            </div>
            <IconButton aria-label={t('profile.neighborhood.close')} tone="surface" size={36} className="shrink-0" onClick={onClose}>
              <X size={16} className="text-v2-ink-2" />
            </IconButton>
          </div>
        }
      >
        {list}
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
            // z-[70] — NOT the z-[48] used by this sheet's arena/partners
            // siblings (PartnerFilterSheet/OpponentPickerSheet/LeagueFilterSheet),
            // which only need to clear a z-[45] overlay in that context. This
            // sheet is launched from inside SettingsModal (z-50) — z-[48]
            // rendered it BEHIND the modal that opens it. Matches
            // EquipmentFilterSheet (z-70/71), SettingsModal's other sibling
            // sheet with the identical role.
            className="fixed inset-0 bg-black/40 z-[70] pointer-events-auto"
            style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
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
              <h2 className="text-base font-black text-gray-900">{t('profile.neighborhood.title')}</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform pointer-events-auto"
                aria-label={t('profile.neighborhood.close')}
              >
                <X size={14} className="text-gray-600" />
              </button>
            </div>
            {cityName && (
              <p className="text-center text-[12px] text-gray-500 -mt-1 pb-3 px-5">{t('profile.neighborhood.inCity', { city: cityName })}</p>
            )}

            {list}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default NeighborhoodPickerSheet;
