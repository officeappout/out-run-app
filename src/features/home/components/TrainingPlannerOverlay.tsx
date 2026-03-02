'use client';

/**
 * TrainingPlannerOverlay — Full-Screen Planning View (Runna-style)
 *
 * Top half: MonthlyCalendarGrid (large config)
 * Bottom half: Compact RollingAgenda with inline (+) per row — no FAB.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarDays, LayoutGrid, Circle as CircleIcon } from 'lucide-react';
import MonthlyCalendarGrid from './calendar/MonthlyCalendarGrid';
import RollingAgenda from './agenda/RollingAgenda';
import AddWorkoutModal from './AddWorkoutModal';
import DaySummarySheet from './DaySummarySheet';
import type { RecurringTemplate } from '@/features/user/scheduling/types/schedule.types';

type PlannerViewMode = 'rings' | 'icons';

interface TrainingPlannerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  recurringTemplate?: RecurringTemplate;
  scheduleDays?: string[];
  programIconKey?: string;
  selectedDate: string;
  onDaySelect: (iso: string) => void;
  onStartWorkout?: () => void;
}

const SLIDE_SPRING = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 32,
  mass: 0.9,
};

export default function TrainingPlannerOverlay({
  isOpen,
  onClose,
  userId,
  recurringTemplate,
  scheduleDays,
  programIconKey,
  selectedDate,
  onDaySelect,
  onStartWorkout,
}: TrainingPlannerOverlayProps) {
  const [viewMode, setViewMode] = useState<PlannerViewMode>('rings');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalDate, setAddModalDate] = useState<string | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDaySummary, setShowDaySummary] = useState(false);

  const handleDaySelect = useCallback((iso: string) => {
    onDaySelect(iso);
    setShowDaySummary(true);
  }, [onDaySelect]);

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => prev === 'rings' ? 'icons' : 'rings');
  }, []);

  const handleInlineAdd = useCallback((date: string) => {
    setAddModalDate(date);
    setShowAddModal(true);
  }, []);

  const handleSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="training-planner"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SLIDE_SPRING}
            className="fixed inset-0 z-50 flex flex-col bg-[#F8FAFC]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* ── Header ── */}
            <div className="flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-100">
              <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between" dir="rtl">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-[#00C9F2]" />
                  <h2 className="text-base font-black text-gray-900">תכנון אימונים</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleViewMode}
                    className={`p-2 rounded-xl transition-all active:scale-90 ${
                      viewMode === 'icons'
                        ? 'bg-cyan-50 text-cyan-600'
                        : 'bg-gray-50 text-gray-400'
                    }`}
                    aria-label="החלף תצוגה"
                  >
                    {viewMode === 'icons' ? (
                      <CircleIcon className="w-4 h-4" />
                    ) : (
                      <LayoutGrid className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 active:scale-90 transition-all"
                    aria-label="סגור"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 flex flex-col overflow-hidden max-w-md w-full mx-auto">
              {/* Top: Calendar Grid */}
              <div
                className="flex-shrink-0 bg-white px-4 pt-2 pb-3"
                style={{ height: '46dvh' }}
              >
                <div className="overflow-hidden h-full">
                  <MonthlyCalendarGrid
                    selectedDate={selectedDate}
                    onDaySelect={handleDaySelect}
                    viewMode={viewMode}
                    userId={userId}
                    recurringTemplate={recurringTemplate}
                    scheduleDays={scheduleDays}
                    programIconKey={programIconKey}
                    cellHeight={56}
                    ringSize={38}
                    ringStroke={6}
                    refreshKey={refreshKey}
                  />
                </div>
              </div>

              <div className="flex-shrink-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

              {/* Bottom: Compact agenda rows */}
              <div className="flex-1 overflow-y-auto pt-2 pb-6">
                <RollingAgenda
                  selectedDate={selectedDate}
                  onDaySelect={handleDaySelect}
                  userId={userId}
                  recurringTemplate={recurringTemplate}
                  onStartWorkout={onStartWorkout}
                  filterMode="future_only"
                  onAddWorkout={handleInlineAdd}
                  refreshKey={refreshKey}
                  onScheduleChanged={handleSaved}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddWorkoutModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        targetDate={addModalDate}
        userId={userId}
        onSaved={handleSaved}
      />

      <DaySummarySheet
        isOpen={showDaySummary}
        onClose={() => setShowDaySummary(false)}
        date={selectedDate}
      />
    </>
  );
}
