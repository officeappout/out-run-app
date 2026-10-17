'use client';

/**
 * FavoritesSheet — bottom sheet that surfaces saved workouts.
 *
 * Self-contained: owns the FavoritesTab render AND the WorkoutPreviewDrawer
 * that opens when a favorite is tapped, then routes to the workout player on
 * "start". Mounted from DashboardTab via the bookmark icon next to the gear.
 */

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import FavoritesTab from '@/features/favorites/components/FavoritesTab';
import WorkoutPreviewDrawer from '@/features/workouts/components/WorkoutPreviewDrawer';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { FavoriteWorkout } from '@/features/favorites/types';

interface FavoritesSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Home v2 (enable_home_v2) look — passed by DashboardTab. */
  v2?: boolean;
}

export default function FavoritesSheet({ isOpen, onClose, v2 = false }: FavoritesSheetProps) {
  const router = useRouter();

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWorkout, setPreviewWorkout] = useState<GeneratedWorkout | null>(null);
  const [previewLocation, setPreviewLocation] = useState<string | undefined>(undefined);

  const handleSelectWorkout = useCallback(
    (generated: GeneratedWorkout, fav: FavoriteWorkout) => {
      setPreviewWorkout(generated);
      setPreviewLocation(fav.workoutLocation ?? undefined);
      setPreviewOpen(true);
    },
    [],
  );

  const handlePreviewClose = useCallback(() => {
    setPreviewOpen(false);
    setPreviewWorkout(null);
  }, []);

  const handleStartWorkout = useCallback(
    (workoutId: string) => {
      router.push(`/workouts/${workoutId}/active`);
    },
    [router],
  );

  return (
    <>
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
              className={
                v2
                  ? 'fixed bottom-0 inset-x-0 z-[99] flex max-h-[92dvh] flex-col rounded-t-[28px] bg-white shadow-v2-sheet'
                  : 'fixed bottom-0 inset-x-0 z-[99] bg-white rounded-t-3xl shadow-2xl max-h-[92dvh] flex flex-col'
              }
              dir="rtl"
            >
              {v2 ? (
                <>
                  <div className="flex shrink-0 justify-center pb-1 pt-2.5">
                    <div className="h-1.5 w-10 rounded-full bg-v2-pill-border" />
                  </div>
                  <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-2">
                    <h2 className="text-[22px] font-black text-v2-ink !tracking-[-0.02em]">שמורים</h2>
                    <button
                      type="button"
                      onClick={onClose}
                      className="grid h-9 w-9 place-items-center rounded-full bg-v2-surface text-v2-ink ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.97]"
                      aria-label="סגור"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto bg-v2-surface px-4 py-4">
                    <FavoritesTab onSelectWorkout={handleSelectWorkout} v2 />
                    <div className="h-6" />
                  </div>
                </>
              ) : (
              <>
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">שמורים</h2>
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
                <FavoritesTab onSelectWorkout={handleSelectWorkout} />
                <div className="h-6" />
              </div>
              </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <WorkoutPreviewDrawer
        isOpen={previewOpen}
        onClose={handlePreviewClose}
        workout={null}
        generatedWorkout={previewWorkout}
        workoutLocation={previewLocation}
        onStartWorkout={handleStartWorkout}
        surface="favorites"
      />
    </>
  );
}
