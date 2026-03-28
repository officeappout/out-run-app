'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Share2, X, CalendarCheck, CalendarPlus } from 'lucide-react';
import type { ScheduleSlot } from '@/types/community.types';
import {
  generateCommunityICS,
  downloadICS,
} from '@/features/user/scheduling/services/communitySchedule.service';

interface PostJoinSuccessDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  verb: string;
  onOpenChat?: () => void;
  /** Schedule slots for ICS generation */
  scheduleSlots?: ScheduleSlot[];
  category?: string;
  address?: string;
  /** Called with user's preference to add sessions to their training plan */
  onPlannerPref?: (addToPlanner: boolean) => void;
}

export default function PostJoinSuccessDrawer({
  isOpen,
  onClose,
  name,
  verb,
  onOpenChat,
  scheduleSlots,
  category,
  address,
  onPlannerPref,
}: PostJoinSuccessDrawerProps) {
  const [addToPlanner, setAddToPlanner] = useState(true);
  const [calendarSync, setCalendarSync] = useState(false);

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://outrun.app';
    const text = `היי, הצטרפתי ל-${name} ב-OutRun! בוא/י להתאמן איתי: ${url}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'OutRun', text });
      } catch {
        // user dismissed
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  };

  const handleCalendarSync = () => {
    if (!scheduleSlots?.length) return;
    const events = scheduleSlots.map((slot) => ({
      groupName: name,
      category: category ?? 'training',
      dayOfWeek: slot.dayOfWeek,
      time: slot.time,
      address,
    }));
    const ics = generateCommunityICS(events);
    downloadICS(ics);
  };

  const handleClose = () => {
    onPlannerPref?.(addToPlanner);
    if (calendarSync) handleCalendarSync();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/40"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.8 }}
            className="fixed bottom-0 left-0 right-0 z-[91] max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl"
          >
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mt-3" />

            <button
              onClick={handleClose}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
            >
              <X size={16} className="text-gray-500" />
            </button>

            <div className="px-6 pt-6 pb-10 text-center" dir="rtl">
              <div className="text-6xl mb-4">🎉</div>

              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2 leading-tight">
                איזה כיף! הצטרפת ל-{name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                הזמן שותף ש{verb} איתך!
              </p>

              {/* ── Preference Toggles ──────────────────────────── */}
              {scheduleSlots && scheduleSlots.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 mb-5 space-y-3 text-right">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300">
                      <CalendarCheck className="w-4 h-4 text-cyan-500" />
                      הוסף מפגשים ללוז אימונים
                    </span>
                    <div
                      role="switch"
                      aria-checked={addToPlanner}
                      onClick={() => setAddToPlanner(!addToPlanner)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        addToPlanner ? 'bg-cyan-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          addToPlanner ? 'translate-x-0.5' : 'translate-x-[22px]'
                        }`}
                      />
                    </div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300">
                      <CalendarPlus className="w-4 h-4 text-emerald-500" />
                      סנכרון ליומן הטלפון
                    </span>
                    <div
                      role="switch"
                      aria-checked={calendarSync}
                      onClick={() => setCalendarSync(!calendarSync)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        calendarSync ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          calendarSync ? 'translate-x-0.5' : 'translate-x-[22px]'
                        }`}
                      />
                    </div>
                  </label>
                </div>
              )}

              {/* Invite partner */}
              <button
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-lg shadow-orange-500/25 transition-all active:scale-[0.97] mb-3"
              >
                <Share2 className="w-4 h-4" />
                הזמן שותף/ה
              </button>

              {/* Chat CTA */}
              <button
                onClick={() => { handleClose(); onOpenChat?.(); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition-all active:scale-[0.97] mb-3"
              >
                <MessageCircle className="w-4 h-4" />
                כנס לצ&apos;אט הקהילה
              </button>

              <button
                onClick={handleClose}
                className="w-full py-3 rounded-2xl text-sm font-bold text-gray-400 dark:text-gray-500"
              >
                אחר כך
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
