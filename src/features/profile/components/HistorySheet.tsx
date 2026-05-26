'use client';

/**
 * HistorySheet — bottom sheet that surfaces past workouts.
 *
 * Mounted from profile/page.tsx and opened when the user taps the workout
 * count in DashboardTab. Forwards individual workout taps up to the parent
 * via `onWorkoutClick` so the existing summary modal flow keeps working.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import HistoryTab from '@/features/profile/components/HistoryTab';
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

interface HistorySheetProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkoutClick: (workout: WorkoutHistoryEntry) => void;
}

export default function HistorySheet({ isOpen, onClose, onWorkoutClick }: HistorySheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[98]"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 35 }}
            className="fixed bottom-0 inset-x-0 z-[99] bg-[#F8FAFC] rounded-t-3xl shadow-2xl max-h-[92dvh] flex flex-col"
            dir="rtl"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-gray-100 bg-white">
              <h2 className="text-lg font-bold text-gray-900">היסטוריית אימונים</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95 transition-transform"
                aria-label="סגור"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <HistoryTab onWorkoutClick={onWorkoutClick} />
              <div className="h-6" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
