'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, CloudUpload, X } from 'lucide-react';
import { OutboxFlusher } from '@/lib/outbox/OutboxFlusher';
import { useT } from '@/hooks/useT';
import { common } from '@/messages/ns/common';
import { useSyncChip } from './useSyncChip';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [depth, setDepth] = useState<{ samples: number; workouts: number }>({
    samples: 0,
    workouts: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOffline(!navigator.onLine);

    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    return OutboxFlusher.onDepthChange(setDepth);
  }, []);

  // The "syncing" chip — a genuinely large backfill only (≥ 100 queued, e.g.
  // the first 90-day HealthKit / Health Connect sync), only while a flush is
  // really running, once per sync, auto-hidden after 3 min, dismissible.
  // Rules + why it used to stay stuck: src/lib/outbox/sync-chip-policy.ts.
  const t = useT(common);
  const queued = depth.samples + depth.workouts;
  const chip = useSyncChip(queued, isOffline);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed bottom-0 inset-x-0 z-[100] bg-[#1E1E1E] text-white px-4 py-2.5 flex flex-col items-center gap-1"
          style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom, 10px))' }}
          dir="rtl"
        >
          <div className="flex items-center justify-center gap-2">
            <WifiOff size={16} className="flex-shrink-0 text-gray-300" />
            <span className="text-[13px] font-medium tracking-wide">
              אין חיבור לאינטרנט — מציג אימונים שמורים בלבד
            </span>
          </div>
          {queued > 0 && (
            <div className="text-[11px] text-gray-400">
              {depth.workouts > 0 && (
                <span>{depth.workouts} אימונים ממתינים לסנכרון</span>
              )}
              {depth.workouts > 0 && depth.samples > 0 && <span> · </span>}
              {depth.samples > 0 && (
                <span>{depth.samples} מדידות סנסור ממתינות</span>
              )}
            </div>
          )}
        </motion.div>
      )}
      {chip.visible && (
        // Top of the screen, not the bottom: at the bottom it sat over the
        // primary CTAs of sheets and wizards (owner report 23.10.2026). The
        // body lets taps through (pointer-events-none) — only the X is live.
        <motion.div
          key="queue-chip"
          role="status"
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
          className="pointer-events-none fixed inset-x-0 z-[100] mx-auto flex w-fit max-w-[calc(100%-24px)] items-center gap-2 rounded-full bg-out-blue py-1.5 ps-3.5 pe-1.5 text-[12px] font-semibold text-white shadow-floating"
          dir="rtl"
        >
          <CloudUpload size={14} className="flex-shrink-0" />
          <span className="min-w-0">{t('sync.backfillChip')}</span>
          <button
            type="button"
            onClick={chip.dismiss}
            aria-label={t('actions.close')}
            className="pointer-events-auto grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-white/20 active:scale-95"
          >
            <X size={13} strokeWidth={2.6} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
