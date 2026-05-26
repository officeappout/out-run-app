'use client';

import React from 'react';
import { Play, Pencil, Volume2, VolumeX, WifiOff } from 'lucide-react';
import ShareAsLiveToggle from '@/features/workout-engine/components/ShareAsLiveToggle';

// Local duplicate of the orchestrator's pill border constant.  One-line
// string — duplicated rather than imported to keep this module self-contained
// (no circular import with WorkoutPreviewDrawer.tsx).
const PILL_BORDER_DRAWER = '0.5px solid #E0E9FF';

export interface DrawerFooterProps {
  /** Count of nearby partners currently in a strength/workout session. */
  similarCount: number;
  /** Tap handler for the "X people training near you" CTA. */
  onOpenLivePartners: () => void;
  /** Workout title piped into the share-as-live presence broadcast. */
  workoutTitleForPresence: string;
  /** User's GPS coordinates (or `null` if permission is denied / pending). */
  userLocation: { lat: number; lng: number } | null;
  /** True when the device is online — drives the "Start" enabled state. */
  isOnline: boolean;
  /** True when the favorite has been downloaded for offline use. */
  isFavDownloaded: boolean;
  /** Stable start-workout handler from `useWorkoutSession`. */
  onStart: () => void;
  /** Optional edit pencil — when omitted, the pencil button is hidden. */
  onEditEntry?: () => void;
  /** Current audio toggle state (`true` = videos play with sound). */
  isAudioEnabled: boolean;
  /** Flip the audio enabled flag (handler from the orchestrator). */
  onToggleAudio: () => void;
}

/**
 * Fixed bottom CTA strip — always visible at `bottom: 0` inside the drawer.
 *
 * Layout, top-to-bottom:
 *
 *   1. "X people training near you" deep-link (only when `similarCount > 0`).
 *   2. Share-as-live toggle (always rendered).
 *   3. Offline banner (only when offline AND favorite isn't downloaded).
 *   4. Start row — gradient Start button + optional edit pencil + audio toggle.
 *
 * Wrapped in `React.memo` so a parent re-render (e.g. scroll progress flip)
 * does not rebuild the footer subtree.  All passed-in callbacks are
 * `useCallback`-stable in the orchestrator, so the memo equality check
 * remains effective.
 */
const DrawerFooterImpl: React.FC<DrawerFooterProps> = ({
  similarCount,
  onOpenLivePartners,
  workoutTitleForPresence,
  userLocation,
  isOnline,
  isFavDownloaded,
  onStart,
  onEditEntry,
  isAudioEnabled,
  onToggleAudio,
}) => {
  const startDisabled = !isOnline && !isFavDownloaded;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-800/50 px-4 pt-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 12px))' }}
    >
      {/* Row 1 — "X people training near you" hint (Partner Finder discovery) */}
      {similarCount > 0 && (
        <button
          type="button"
          onClick={onOpenLivePartners}
          className="block w-full text-center pb-1.5 active:scale-[0.99] transition-transform"
          style={{ color: '#00ADEF', fontSize: '13px' }}
          dir="rtl"
        >
          {`${similarCount} אנשים מתאמנים כוח קרוב אליך`}
        </button>
      )}

      {/* Row 2 — share-as-live toggle (always visible) */}
      <ShareAsLiveToggle
        activityType="strength"
        workoutTitle={workoutTitleForPresence}
        userLocation={userLocation}
        className="pb-2"
      />

      {startDisabled && (
        <div className="flex items-center justify-center gap-1.5 pb-2" dir="rtl">
          <WifiOff size={12} className="text-gray-400" />
          <span className="text-[11px] text-gray-400">
            שמור אימון למועדפים כדי להתאמן אופליין
          </span>
        </div>
      )}

      <div className="flex items-center gap-3" dir="rtl">
        {/* Start Workout — gradient pill, full-width (RIGHT in RTL) */}
        <button
          onClick={onStart}
          disabled={startDisabled}
          className="flex-1 text-white font-extrabold rounded-full active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-lg border-0 outline-none disabled:opacity-40 disabled:active:scale-100"
          style={{ background: 'linear-gradient(to left, #0CF2E3, #00BAF7)', height: 42 }}
        >
          <Play size={20} fill="currentColor" />
          <span>התחלת אימון</span>
        </button>

        {/* Edit button — only shown when onEditEntry is provided */}
        {onEditEntry && (
          <button
            onClick={onEditEntry}
            className="flex-shrink-0 w-[42px] h-[42px] rounded-full flex items-center justify-center transition-all active:scale-90 shadow-sm"
            style={{ background: '#EFF6FF', border: '0.5px solid #BFDBFE' }}
            title="ערוך אימון"
            aria-label="ערוך אימון"
          >
            <Pencil size={18} className="text-blue-500" />
          </button>
        )}

        {/* Audio Toggle — circle, pill-border (LEFT in RTL) */}
        <button
          onClick={onToggleAudio}
          className="flex-shrink-0 w-[42px] h-[42px] rounded-full flex items-center justify-center transition-all active:scale-90 shadow-sm"
          style={{
            background: isAudioEnabled ? '#F0FDFA' : '#FEFEFE',
            border: PILL_BORDER_DRAWER,
          }}
          title={isAudioEnabled ? 'השתק סרטונים' : 'הפעל שמע'}
          aria-label={isAudioEnabled ? 'השתק סרטונים' : 'הפעל שמע'}
        >
          {isAudioEnabled ? (
            <Volume2 size={20} className="text-cyan-600" />
          ) : (
            <VolumeX size={20} className="text-slate-400" />
          )}
        </button>
      </div>
    </div>
  );
};

const DrawerFooter = React.memo(DrawerFooterImpl);
DrawerFooter.displayName = 'DrawerFooter';

export default DrawerFooter;
