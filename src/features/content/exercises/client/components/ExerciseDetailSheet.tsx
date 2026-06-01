'use client';

/**
 * ExerciseDetailSheet — library exercise detail surface ("Spotify Track Page").
 *
 * A single immersive 95vh bottom sheet with ONE vertical scroll conduit:
 * the network-aware hero video sits at the top of MasterExerciseView and every
 * section flows beneath it in the same scroll timeline. No nested scrollers,
 * no snap points, no morphing hero — a clean drag-down from the top dismisses.
 *
 * This component owns only the sheet chrome (portal, backdrop, drag-to-dismiss,
 * close, body-scroll-lock). All content + data live in MasterExerciseView.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useExerciseLibraryStore } from '../store/useExerciseLibraryStore';
import MasterExerciseView from './MasterExerciseView';

export default function ExerciseDetailSheet() {
  const router = useRouter();

  // ── Store reads ──────────────────────────────────────────────────────────
  const isOpen         = useExerciseLibraryStore((s) => s.isDetailOpen);
  const exercise       = useExerciseLibraryStore((s) => s.selectedExercise);
  const close          = useExerciseLibraryStore((s) => s.closeDetail);
  const filterLocation = useExerciseLibraryStore((s) => s.filters.location);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Body scroll lock ─────────────────────────────────────────────────────
  // Locks the page behind the sheet so wheel/touch on the dimmed area doesn't
  // scroll the library underneath. Compensates for the disappearing scrollbar
  // with padding-right to avoid a visible reflow when the sheet opens/closes.
  useEffect(() => {
    if (!isOpen) return;
    if (typeof document === 'undefined') return;

    const { body, documentElement: html } = document;
    const prevBodyOverflow     = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;
    const prevHtmlOverflow     = html.style.overflow;

    const scrollbarGutter = window.innerWidth - html.clientWidth;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    if (scrollbarGutter > 0) body.style.paddingRight = `${scrollbarGutter}px`;

    return () => {
      body.style.overflow     = prevBodyOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
      html.style.overflow     = prevHtmlOverflow;
    };
  }, [isOpen]);

  const handleNavigateToAnalytics = (exerciseId: string, exerciseName: string) => {
    router.push(`/profile/exercise/${exerciseId}?name=${encodeURIComponent(exerciseName)}`);
  };

  const handleNavigateToRoadmap = (baseMovementId: string) => {
    router.push(`/exercises/roadmap/${encodeURIComponent(baseMovementId)}`);
  };

  const sheet = (
    <AnimatePresence>
      {isOpen && exercise && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/50 z-[60]"
          />

          {/* Single immersive sheet — drag the whole sheet down to dismiss.
              The inner scroll container owns vertical scrolling; framer's drag
              only wins the gesture at the top of the scroll (scrollTop === 0),
              giving a fluid "roll the layout over the screen" feel without
              gesture traps. */}
          <motion.div
            key="master-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => { if (info.offset.y > 140) close(); }}
            className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl shadow-drawer flex flex-col overflow-hidden"
            style={{ height: '95vh' }}
            dir="rtl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Close */}
            <button
              type="button"
              onClick={close}
              className="absolute top-3 left-3 p-2 text-gray-500 hover:text-gray-700 rounded-full bg-white/80 backdrop-blur-sm z-30 shadow-sm"
              aria-label="סגור"
            >
              <X size={18} />
            </button>

            {/* ── SINGLE conduit scroll ── */}
            <div className="flex-auto min-h-0 overflow-y-auto overscroll-contain">
              <MasterExerciseView
                exercise={exercise}
                filterLocation={filterLocation}
                onNavigateToAnalytics={handleNavigateToAnalytics}
                onNavigateToRoadmap={handleNavigateToRoadmap}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
