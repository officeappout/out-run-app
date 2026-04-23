'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, CloudUpload } from 'lucide-react';
import { OutboxFlusher } from '@/lib/outbox/OutboxFlusher';

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

  const queued = depth.samples + depth.workouts;
  const showQueueChip = !isOffline && queued > 0;

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
      {showQueueChip && (
        <motion.button
          key="queue-chip"
          type="button"
          onClick={() => OutboxFlusher.flushNow('manual')}
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed bottom-3 inset-x-0 z-[100] mx-auto w-fit flex items-center gap-2 bg-out-blue text-white text-[12px] font-semibold px-3 py-1.5 rounded-full shadow-floating"
          dir="rtl"
        >
          <CloudUpload size={14} />
          <span>מסנכרן {queued} פריטים…</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
