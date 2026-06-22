'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { MilestoneEvent } from '@/features/workout-engine/shared/hooks/useGroupPresenceListener';

interface MilestoneFeedProps {
  milestones: MilestoneEvent[];
}

const AUTO_DISMISS_MS = 3000;

export default function MilestoneFeed({ milestones }: MilestoneFeedProps) {
  // Queue of milestone ids already shown — avoids re-displaying on re-render.
  const shownRef = useRef<Set<string>>(new Set());
  const [current, setCurrent] = useState<MilestoneEvent | null>(null);
  const [queue, setQueue] = useState<MilestoneEvent[]>([]);

  // Enqueue incoming milestones that haven't been shown yet.
  useEffect(() => {
    const fresh = milestones.filter((m) => !shownRef.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => shownRef.current.add(m.id));
    setQueue((q) => [...q, ...fresh]);
  }, [milestones]);

  // Dequeue: show next when current slot is empty.
  useEffect(() => {
    if (current !== null || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [current, queue]);

  // Auto-dismiss after timeout.
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [current]);

  const label = current
    ? current.type === 'collective'
      ? `יחד עברתם ${current.distanceKm} ק"מ 💪`
      : `${current.name} · ${current.distanceKm} ק"מ 🏃`
    : '';

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ x: -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className="absolute z-[55] pointer-events-none"
          style={{ left: 12, top: '42%' }}
          aria-live="polite"
        >
          <div
            className="rounded-2xl px-4 py-2 text-white text-sm font-semibold"
            style={{
              background: 'rgba(0,0,0,0.72)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              maxWidth: 240,
              direction: 'rtl',
            }}
          >
            {label}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
