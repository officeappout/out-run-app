'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { getProgramIcon } from '@/features/content/programs';

export interface ProgramDrawerData {
  templateId: string;
  name: string;
  description?: string;
  currentLevel: number;
  maxLevel: number;
  percent: number;
  totalWorkoutsCompleted: number;
  iconKey?: string;
}

interface ProgramDrawerProps {
  program: ProgramDrawerData | null;
  onClose: () => void;
}

export default function ProgramDrawer({ program, onClose }: ProgramDrawerProps) {
  const isOpen = program !== null;

  return (
    <AnimatePresence>
      {isOpen && program && (
        <>
          {/* Backdrop */}
          <motion.div
            key="program-drawer-backdrop"
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="program-drawer-sheet"
            className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl overflow-y-auto"
            style={{
              maxHeight: '85vh',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            dir="rtl"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-3 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-gray-900">
                  {getProgramIcon(program.iconKey ?? program.templateId, 'w-6 h-6')}
                </span>
                <h2 className="text-lg font-black text-gray-900">{program.name}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-5">
              {/* Description */}
              {program.description && (
                <p className="text-sm text-gray-600 leading-relaxed">
                  {program.description}
                </p>
              )}

              {/* Stat pills */}
              <div className="grid grid-cols-3 gap-2">
                <StatPill label="רמה נוכחית" value={String(program.currentLevel)} />
                <StatPill label="התקדמות" value={`${program.percent}%`} />
                <StatPill label="סה״כ אימונים" value={String(program.totalWorkoutsCompleted)} />
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-1">
                {/* Close */}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold active:bg-gray-200 transition-colors"
                >
                  סגור
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-gray-50 rounded-xl py-3 px-2">
      <span className="text-base font-black text-gray-900 tabular-nums">{value}</span>
      <span className="text-[10px] font-medium text-gray-500 text-center leading-tight">{label}</span>
    </div>
  );
}
