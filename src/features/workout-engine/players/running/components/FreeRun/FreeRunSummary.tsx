'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CheckCircle, Trash2, Save, Share2, Coins } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';
import RunLapsList from './RunLapsList';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import RunMapBlock from '@/features/workout-engine/summary/components/running/RunMapBlock';

import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

interface FreeRunSummaryProps {
  onDelete?: () => void;
  onSave?: () => void;
  // Read-only mode for historical workouts
  workout?: WorkoutHistoryEntry;
  isReadOnly?: boolean;
  onClose?: () => void;
}

export default function FreeRunSummary({ 
  onDelete, 
  onSave,
  workout,
  isReadOnly = false,
  onClose
}: FreeRunSummaryProps) {
  const router = useRouter();
  const { totalDistance: sessionDistance, totalDuration: sessionDuration } = useSessionStore();
  const { laps: sessionLaps, routeCoords: sessionRouteCoords, currentPace: sessionPace, totalCalories: sessionCalories, clearRunningData } = useRunningPlayer();
  const [showConfetti, setShowConfetti] = useState(false);

  // Use workout data if in read-only mode, otherwise use session data
  const totalDistance = isReadOnly && workout ? workout.distance : sessionDistance;
  const totalDuration = isReadOnly && workout ? workout.duration : sessionDuration;
  const laps = isReadOnly && workout ? [] : sessionLaps; // Historical workouts don't have laps data
  
  // Convert routePath to number[][] format for RunMapBlock
  // Handle both formats: [{lat, lng}] (new) or [[lat, lng]] (old)
  const routeCoords: number[][] = (() => {
    if (isReadOnly && workout?.routePath) {
      try {
        if (!Array.isArray(workout.routePath) || workout.routePath.length === 0) {
          return [];
        }
        
        return workout.routePath
          .map((coord: any) => {
            // New format: {lat, lng}
            if (coord && typeof coord === 'object' && 'lat' in coord && 'lng' in coord) {
              return [Number(coord.lng), Number(coord.lat)]; // Mapbox expects [lng, lat]
            }
            // Old format: [lat, lng] or [lng, lat]
            if (Array.isArray(coord) && coord.length >= 2) {
              return [Number(coord[0]), Number(coord[1])];
            }
            return null;
          })
          .filter((coord: number[] | null): coord is number[] => 
            coord !== null && !isNaN(coord[0]) && !isNaN(coord[1])
          );
      } catch (error) {
        console.error('[FreeRunSummary] Error parsing routePath:', error);
        return [];
      }
    }
    // Active session - already in correct format
    return sessionRouteCoords;
  })();
  
  const currentPace = isReadOnly && workout ? workout.pace : sessionPace;
  const totalCalories = isReadOnly && workout ? workout.calories : sessionCalories;

  // Use calculated calories from store (real-time calculation)
  const calories = totalCalories || 0;

  // Trigger confetti effect on mount (only for new workouts, not historical)
  useEffect(() => {
    if (!isReadOnly) {
      setShowConfetti(true);
      // Simple confetti effect using framer-motion
      const timer = setTimeout(() => setShowConfetti(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isReadOnly]);

  // Format time
  const formatTime = (seconds: number): string => {
    if (!seconds || seconds < 0 || !isFinite(seconds)) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate average pace from total distance and duration
  const avgPace = totalDistance > 0 && totalDuration > 0
    ? (totalDuration / 60) / totalDistance
    : currentPace || 0;

  // Share workout results
  const handleShare = async () => {
    const shareText = `🏃 סיימתי אימון ריצה חופשית!\n\n📏 מרחק: ${totalDistance.toFixed(2)} ק"מ\n⏱️ זמן: ${formatTime(totalDuration)}\n⚡ קצב ממוצע: ${formatPace(avgPace)}\n🔥 קלוריות: ${calories}\n\n#OutRun #ריצה`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'אימון הושלם!',
          text: shareText,
        });
      } catch (error) {
        // User cancelled or error occurred
        console.log('[FreeRunSummary] Share cancelled or failed');
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        alert('הטקסט הועתק ללוח!');
      } catch (error) {
        console.error('[FreeRunSummary] Failed to copy to clipboard:', error);
      }
    }
  };

  // Handle save and close
  const handleSaveAndClose = () => {
    if (isReadOnly && onClose) {
      onClose();
      return;
    }
    
    if (onSave) {
      onSave();
    } else {
      const { clearSession } = useSessionStore.getState();
      clearRunningData();
      clearSession();
      router.push('/home');
    }
  };

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col h-screen bg-gray-50 font-sans pointer-events-auto"
      style={{ fontFamily: 'var(--font-simpler)' }}
      dir="rtl"
    >
      {/* Confetti Effect */}
      {showConfetti && typeof window !== 'undefined' && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(30)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-10px',
                backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'][Math.floor(Math.random() * 5)],
              }}
              initial={{ y: 0, opacity: 1, rotate: 0 }}
              animate={{
                y: (typeof window !== 'undefined' ? window.innerHeight : 800) + 100,
                opacity: 0,
                rotate: 360,
                x: (Math.random() - 0.5) * 200,
              }}
              transition={{
                duration: 2 + Math.random(),
                delay: Math.random() * 0.5,
                ease: 'easeOut',
              }}
            />
          ))}
        </div>
      )}

      {/* Map Hero - Fixed at top, 40% of screen */}
      <div className="relative w-full" style={{ height: '40vh', minHeight: '40vh', maxHeight: '40vh' }}>
        {routeCoords.length > 0 ? (
          <div className="w-full h-full">
            <RunMapBlock
              routeCoords={routeCoords}
              startCoord={routeCoords[0]}
              endCoord={routeCoords[routeCoords.length - 1]}
            />
          </div>
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <p className="text-gray-400">אין נתוני מסלול</p>
          </div>
        )}
      </div>

      {/* Scrollable Details Card - Starts below map, covers rest of screen */}
      <div className="flex-1 overflow-y-auto pointer-events-auto relative z-[30]">
        <div className="bg-white rounded-t-[32px] shadow-2xl min-h-full">
          <div className="px-6 pt-6 pb-24 space-y-6">
            {/* Header */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="flex items-center justify-center gap-3 mb-2"
            >
              <CheckCircle size={32} className="text-[#00ADEF]" fill="currentColor" />
              <h1 className="text-2xl font-black tracking-wide text-gray-900">אימון הושלם!</h1>
            </motion.div>
            <p className="text-center text-gray-500 text-sm mb-4">כל הכבוד על ההתמדה</p>

            {/* Coin Badge */}
            {/* COIN_SYSTEM_PAUSED: Re-enable in April */}
            {IS_COIN_SYSTEM_ENABLED && calories > 0 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ 
                  type: 'spring', 
                  stiffness: 300, 
                  damping: 20,
                  delay: 0.2 
                }}
                className="bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-xl shadow-lg p-4 flex items-center justify-center gap-3"
              >
                <motion.div
                  animate={{ rotate: [0, 10, -10, 10, 0] }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                >
                  <Coins size={32} className="text-yellow-800" fill="currentColor" />
                </motion.div>
                <div className="text-center">
                  <div className="text-3xl font-black text-yellow-900">
                    +{calories}
                  </div>
                  <div className="text-sm font-bold text-yellow-800">מטבעות</div>
                </div>
              </motion.div>
            )}

            {/* Stats Grid */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-gray-50 rounded-xl p-6"
            >
              <h2 className="text-lg font-bold text-gray-900 mb-4 text-center">סיכום אימון</h2>
              <div className="grid grid-cols-2 gap-4">
                {/* Total Distance */}
                <div className="text-center p-4 bg-cyan-50 rounded-xl">
                  <div className="text-3xl font-black text-[#00ADEF] mb-1">
                    {totalDistance.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600 font-medium">קילומטר</div>
                </div>

                {/* Total Time */}
                <div className="text-center p-4 bg-orange-50 rounded-xl">
                  <div className="text-3xl font-black text-[#FF8C00] mb-1">
                    {formatTime(totalDuration)}
                  </div>
                  <div className="text-sm text-gray-600 font-medium">זמן</div>
                </div>

                {/* Average Pace */}
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <div className="text-3xl font-black text-blue-600 mb-1">
                    {formatPace(avgPace)}
                  </div>
                  <div className="text-sm text-gray-600 font-medium">קצב ממוצע</div>
                </div>

                {/* Calories */}
                <div className="text-center p-4 bg-red-50 rounded-xl">
                  <div className="text-3xl font-black text-red-600 mb-1">
                    {calories}
                  </div>
                  <div className="text-sm text-gray-600 font-medium">קלוריות</div>
                </div>
              </div>
            </motion.div>

            {/* Laps Table */}
            {laps.length > 0 && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="bg-gray-50 rounded-xl shadow-sm overflow-hidden"
                style={{ height: '300px' }}
              >
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-bold text-gray-900">פירוט הקפות</h2>
                </div>
                <div className="h-[calc(300px-4rem)] overflow-y-auto">
                  <RunLapsList />
                </div>
              </motion.div>
            )}

            {/* Action Buttons - Fixed at bottom of scrollable card */}
            <div
              className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 shadow-lg -mx-6 -mb-6 mt-6"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            >
              {!isReadOnly && (
                <button
                  onClick={handleShare}
                  className="px-4 py-4 rounded-xl font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all shadow-sm min-h-[44px] flex items-center justify-center gap-2 pointer-events-auto"
                >
                  <Share2 size={20} />
                  שתף
                </button>
              )}
              <button
                onClick={handleSaveAndClose}
                className={`${isReadOnly ? 'w-full' : 'flex-1'} py-4 rounded-xl font-bold bg-[#00ADEF] text-white hover:bg-[#00D4EE] transition-all shadow-md hover:shadow-lg min-h-[44px] flex items-center justify-center gap-2 pointer-events-auto`}
              >
                {isReadOnly ? (
                  <>
                    <span>סגור</span>
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    שמור וסגור
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
