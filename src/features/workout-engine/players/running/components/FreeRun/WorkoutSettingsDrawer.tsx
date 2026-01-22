'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';

interface WorkoutSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WorkoutSettingsDrawer({ isOpen, onClose }: WorkoutSettingsDrawerProps) {
  const { settings, updateSettings } = useRunningPlayer();
  
  // Local state for settings (to allow canceling changes)
  const [localSettings, setLocalSettings] = useState(settings);

  // Update local state when drawer opens
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
    }
  }, [isOpen, settings]);

  const handleSave = () => {
    updateSettings(localSettings);
    onClose();
  };

  const handleAutoLapModeChange = (mode: 'distance' | 'time' | 'off') => {
    console.log('Button clicked:', mode);
    setLocalSettings({
      ...localSettings,
      autoLapMode: mode,
      // Reset value when switching modes
      autoLapValue: mode === 'distance' ? 1.0 : mode === 'time' ? 5.0 : 0,
    });
  };

  const handleDistanceChange = (value: number) => {
    setLocalSettings({
      ...localSettings,
      autoLapValue: value,
    });
  };

  const handleTimeChange = (value: number) => {
    setLocalSettings({
      ...localSettings,
      autoLapValue: value,
    });
  };

  const handleToggle = (key: 'enableAudio' | 'enableAutoPause' | 'enableCountdown') => {
    console.log('Toggle clicked:', key, !localSettings[key]);
    setLocalSettings({
      ...localSettings,
      [key]: !localSettings[key],
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] pointer-events-auto"
            style={{ isolation: 'isolate' }}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[100000] overflow-y-auto pointer-events-auto"
            style={{ fontFamily: 'Assistant, sans-serif', isolation: 'isolate' }}
            dir="rtl"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-2xl font-black text-gray-900">הגדרות אימון</h2>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px]"
              >
                <X size={24} className="text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-6 space-y-8">
              {/* Auto-Lap Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900">הקפה אוטומטית</h3>
                
                {/* Mode Selection */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAutoLapModeChange('off')}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
                      localSettings.autoLapMode === 'off'
                        ? 'bg-[#00ADEF] text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    כבוי
                  </button>
                  <button
                    onClick={() => handleAutoLapModeChange('distance')}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
                      localSettings.autoLapMode === 'distance'
                        ? 'bg-[#00ADEF] text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    מרחק
                  </button>
                  <button
                    onClick={() => handleAutoLapModeChange('time')}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${
                      localSettings.autoLapMode === 'time'
                        ? 'bg-[#00ADEF] text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    זמן
                  </button>
                </div>

                {/* Distance Slider */}
                {localSettings.autoLapMode === 'distance' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex justify-between items-end">
                      <span className="text-sm text-gray-500 font-medium">מרחק הקפה</span>
                      <span className="text-2xl font-black text-[#00ADEF] tracking-tight">
                        {localSettings.autoLapValue.toFixed(1)} <span className="text-base font-bold text-gray-400">ק"מ</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value={localSettings.autoLapValue}
                      onChange={(e) => handleDistanceChange(Number(e.target.value))}
                      className="w-full h-3 bg-gray-100 rounded-full appearance-none cursor-pointer accent-[#00ADEF] hover:accent-[#00D4EE] transition-all"
                      style={{
                        background: `linear-gradient(to right, #00ADEF 0%, #00ADEF ${((localSettings.autoLapValue - 0.1) / (2.0 - 0.1)) * 100}%, #E5E7EB ${((localSettings.autoLapValue - 0.1) / (2.0 - 0.1)) * 100}%, #E5E7EB 100%)`,
                      }}
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>0.1 ק"מ</span>
                      <span>2.0 ק"מ</span>
                    </div>
                  </motion.div>
                )}

                {/* Time Slider */}
                {localSettings.autoLapMode === 'time' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex justify-between items-end">
                      <span className="text-sm text-gray-500 font-medium">זמן הקפה</span>
                      <span className="text-2xl font-black text-[#00ADEF] tracking-tight">
                        {localSettings.autoLapValue.toFixed(1)} <span className="text-base font-bold text-gray-400">דק'</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={localSettings.autoLapValue}
                      onChange={(e) => handleTimeChange(Number(e.target.value))}
                      className="w-full h-3 bg-gray-100 rounded-full appearance-none cursor-pointer accent-[#00ADEF] hover:accent-[#00D4EE] transition-all"
                      style={{
                        background: `linear-gradient(to right, #00ADEF 0%, #00ADEF ${((localSettings.autoLapValue - 1) / (10 - 1)) * 100}%, #E5E7EB ${((localSettings.autoLapValue - 1) / (10 - 1)) * 100}%, #E5E7EB 100%)`,
                      }}
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>1 דק'</span>
                      <span>10 דק'</span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Toggles Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900">הגדרות נוספות</h3>
                
                {/* Audio Cues Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-gray-900 mb-1">הכרזות קוליות</h4>
                    <p className="text-sm text-gray-500">הכרזה על סטטיסטיקות הקפות</p>
                  </div>
                  <button
                    onClick={() => handleToggle('enableAudio')}
                    className={`relative w-14 h-8 rounded-full transition-colors min-w-[56px] min-h-[32px] ${
                      localSettings.enableAudio ? 'bg-[#00ADEF]' : 'bg-gray-300'
                    }`}
                  >
                    <motion.div
                      animate={{ x: localSettings.enableAudio ? 24 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md"
                    />
                  </button>
                </div>

                {/* Auto-Pause Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-gray-900 mb-1">השהיה אוטומטית</h4>
                    <p className="text-sm text-gray-500">עצירת טיימר כאשר התנועה נעצרת</p>
                  </div>
                  <button
                    onClick={() => handleToggle('enableAutoPause')}
                    className={`relative w-14 h-8 rounded-full transition-colors min-w-[56px] min-h-[32px] ${
                      localSettings.enableAutoPause ? 'bg-[#00ADEF]' : 'bg-gray-300'
                    }`}
                  >
                    <motion.div
                      animate={{ x: localSettings.enableAutoPause ? 24 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md"
                    />
                  </button>
                </div>

                {/* Countdown Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-gray-900 mb-1">ספירה לאחור</h4>
                    <p className="text-sm text-gray-500">עיכוב של 5 שניות לפני התחלת האימון</p>
                  </div>
                  <button
                    onClick={() => handleToggle('enableCountdown')}
                    className={`relative w-14 h-8 rounded-full transition-colors min-w-[56px] min-h-[32px] ${
                      localSettings.enableCountdown ? 'bg-[#00ADEF]' : 'bg-gray-300'
                    }`}
                  >
                    <motion.div
                      animate={{ x: localSettings.enableCountdown ? 24 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md"
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Footer with Save Button */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <motion.button
                onClick={handleSave}
                whileTap={{ scale: 0.95 }}
                className="w-full py-4 rounded-xl font-bold bg-[#00ADEF] text-white hover:bg-[#00D4EE] transition-all shadow-md hover:shadow-lg min-h-[44px]"
              >
                שמור
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
