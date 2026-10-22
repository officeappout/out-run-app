'use client';

/**
 * FullTutorialOverlay — the fullscreen long-form tutorial ("צפה בהסבר המלא"):
 * safe-area-inset header with a 44px close button on the RTL start edge and
 * the exercise name, then the facility-page provider-aware player (Bunny HLS +
 * native controls). Extracted from ExerciseVideoPlayer (same markup) so the
 * session-list row details can open the same overlay.
 */

import React from 'react';
import { X } from 'lucide-react';
import TutorialVideoPlayer from '@/features/content/exercises/client/components/ExerciseVideoPlayer';
import type { ExternalVideo } from '@/features/content/exercises/core/exercise.types';

export interface FullTutorialOverlayProps {
  video: ExternalVideo;
  exerciseName: string;
  onClose: () => void;
}

export default function FullTutorialOverlay({ video, exerciseName, onClose }: FullTutorialOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      dir="rtl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div
        className="flex items-center justify-between px-4 pb-3 shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 0.75rem)' }}
      >
        <button
          onClick={onClose}
          className="flex items-center justify-center w-10 h-10 min-w-[44px] min-h-[44px] bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/20 shrink-0"
          aria-label="סגור"
        >
          <X size={20} />
        </button>
        <span className="text-white text-base font-bold truncate" style={{ fontFamily: 'var(--font-simpler)' }}>
          {exerciseName}
        </span>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <TutorialVideoPlayer
          video={video}
          mode="tutorial"
          posterUrl={video.thumbnailUrl ?? null}
          objectFit="contain"
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
