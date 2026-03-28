'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Map } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface NavigationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  label?: string;
}

export default function NavigationSheet({ isOpen, onClose, lat, lng, label }: NavigationSheetProps) {
  const router = useRouter();
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
      label: 'מפה בתוך האפליקציה',
      icon: '📍',
      color: 'bg-cyan-50 text-cyan-700',
      action: () => {
        onClose();
        router.push(`/map?lat=${lat}&lng=${lng}`);
      },
    },
  ];

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
                  <h3 className="text-base font-black text-gray-900 dark:text-white">ניווט למיקום</h3>
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

              {/* Navigation options */}
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
