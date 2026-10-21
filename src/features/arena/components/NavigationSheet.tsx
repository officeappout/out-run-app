'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Map } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import Sheet from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';

interface NavigationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  label?: string;
}

export default function NavigationSheet({ isOpen, onClose, lat, lng, label }: NavigationSheetProps) {
  const t = useT(community);
  const router = useRouter();
  // enable_home_v2: the shared <Sheet>; flag off keeps the markup below untouched.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const options = [
    {
      id: 'waze',
      label: 'Waze',
      icon: '🚗',
      color: 'bg-[#33CCFF]/10 text-[#0099CC]',
      action: () => window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, '_blank'),
    },
    {
      id: 'google',
      label: 'Google Maps',
      icon: '🗺️',
      color: 'bg-blue-50 text-blue-600',
      action: () =>
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank'),
    },
    ...(isIOS
      ? [{
          id: 'apple',
          label: 'Apple Maps',
          icon: '🍎',
          color: 'bg-gray-50 text-gray-700',
          action: () => window.open(`maps://maps.apple.com/?daddr=${lat},${lng}`, '_blank'),
        }]
      : []),
    {
      id: 'appmap',
      label: t('nav.inAppMap'),
      icon: '📍',
      color: 'bg-cyan-50 text-cyan-700',
      action: () => {
        onClose();
        router.push(`/map?lat=${lat}&lng=${lng}`);
      },
    },
  ];

  const optionList = (
    <div className="space-y-2.5">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => { opt.action(); if (opt.id !== 'appmap') onClose(); }}
          className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.97] ${opt.color}`}
        >
          <span className="text-xl">{opt.icon}</span>
          <span>{opt.label}</span>
          <Map className="w-4 h-4 ml-auto opacity-40" />
        </button>
      ))}
    </div>
  );

  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        // Backdrop z-[95] / panel z-[96] (.cursorrules), in place.
        zIndex={SHEET_Z.navigatePanel}
        backdropZIndex={SHEET_Z.navigate}
        portal={false}
        keyboardAware={false}
        backdropStyle={{ backdropFilter: 'blur(4px)' }}
        frameClassName="max-w-md mx-auto"
        safeArea={false}
        scroll="none"
        transition={{ type: 'spring', stiffness: 340, damping: 36, mass: 0.7 }}
        ariaLabel={t('nav.title')}
        header={
          <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-2">
            <div className="min-w-0">
              <h2 className="text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{t('nav.title')}</h2>
              {label && <p className="truncate text-[12.5px] font-bold text-v2-muted">{label}</p>}
            </div>
            <IconButton aria-label={t('nav.close')} tone="surface" size={36} className="shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        }
      >
        <div className="px-5 pb-8" dir="rtl">{optionList}</div>
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
            className="fixed inset-0 z-[95] bg-black/40"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 36, mass: 0.7 }}
            className="fixed bottom-0 left-0 right-0 z-[96] max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl"
          >
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mt-3" />

            <div className="px-5 pt-4 pb-8" dir="rtl">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-base font-black text-gray-900 dark:text-white">{t('nav.title')}</h3>
                  {label && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[240px]">
                      {label}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
                >
                  <X size={16} className="text-gray-500" />
                </button>
              </div>

              {optionList}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
