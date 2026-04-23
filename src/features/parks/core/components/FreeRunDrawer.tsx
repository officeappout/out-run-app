"use client";

import React, { useState } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { Play, X, Footprints, Activity, Bike, Settings } from 'lucide-react';
import { ActivityType } from '../types/route.types';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import WorkoutSettingsDrawer from '@/features/workout-engine/players/running/components/FreeRun/WorkoutSettingsDrawer';

interface FreeRunDrawerProps {
  currentActivity: ActivityType;
  onActivityChange: (type: ActivityType) => void;
  onStartWorkout: () => void;
  onClose: () => void;
}

const ACTIVITIES: Array<{ id: ActivityType; label: string; icon: React.ElementType; emoji: string }> = [
  { id: 'walking', label: 'הליכה', icon: Footprints, emoji: '🚶' },
  { id: 'running', label: 'ריצה', icon: Activity, emoji: '🏃' },
  { id: 'cycling', label: 'רכיבה', icon: Bike, emoji: '🚴' },
];

export default function FreeRunDrawer({ currentActivity, onActivityChange, onStartWorkout, onClose }: FreeRunDrawerProps) {
  const dragControls = useDragControls();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeLabel = ACTIVITIES.find(a => a.id === currentActivity)?.label || 'אימון';

  return (
    <>
      <div className="fixed inset-0 z-[100] pointer-events-none">
        <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />

        <motion.div
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.25}
          onDragEnd={(_, info) => {
            if (info.offset.y > 80 || info.velocity.y > 300) onClose();
          }}
          initial={{ y: 400 }}
          animate={{ y: 0 }}
          exit={{ y: 400 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 pointer-events-auto"
        >
          <div className="bg-white rounded-t-3xl shadow-2xl overflow-hidden pb-[90px]">
            {/* Drag handle */}
            <div
              className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex justify-between items-center px-5 mb-4" dir="rtl">
              <span className="text-base font-black text-gray-900">{activeLabel} חופשית</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <Settings size={16} className="text-gray-500" />
                </button>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={16} className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* Activity selector */}
            <div className="px-5 mb-5" dir="rtl">
              <div className="flex gap-2">
                {ACTIVITIES.map(({ id, label, emoji }) => {
                  const isActive = currentActivity === id;
                  return (
                    <button
                      key={id}
                      onClick={() => onActivityChange(id)}
                      className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl transition-all active:scale-[0.97] border ${
                        isActive
                          ? 'bg-cyan-50 border-cyan-200 ring-1 ring-cyan-100'
                          : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-2xl">{emoji}</span>
                      <span className={`text-xs font-bold ${isActive ? 'text-cyan-700' : 'text-gray-500'}`}>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subtitle */}
            <p className="text-center text-sm text-gray-400 mb-4 px-5">ללא יעדים מוגדרים, רק אתה והדרך.</p>

            {/* Start button */}
            <div className="px-5 pb-2">
              <button
                onClick={async () => {
                  if (typeof window !== 'undefined') {
                    const { audioService } = await import('@/features/workout-engine/core/services/AudioService');
                    audioService.unlock();
                  }
                  useRunningPlayer.getState().setRunMode('free');
                  onStartWorkout();
                }}
                className="w-full py-4 rounded-2xl font-bold text-lg text-white shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                style={{ backgroundColor: '#00E5FF' }}
              >
                <Play size={20} fill="currentColor" />
                התחל אימון חופשי
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      <WorkoutSettingsDrawer isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
