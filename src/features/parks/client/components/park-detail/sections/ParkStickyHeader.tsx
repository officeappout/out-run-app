'use client';

import { motion, type MotionValue } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';

interface ParkStickyHeaderProps {
  name: string;
  onClose: () => void;
  headerOpacity: MotionValue<number>;
  headerPointerEvents: MotionValue<'none' | 'auto'>;
}

/** Sticky header that fades in as the body scrolls — compositor-threaded opacity. */
export default function ParkStickyHeader({ name, onClose, headerOpacity, headerPointerEvents }: ParkStickyHeaderProps) {
  return (
    <motion.div
      className="absolute top-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-gray-200 dark:border-slate-800"
      style={{ opacity: headerOpacity, pointerEvents: headerPointerEvents }}
    >
      <div className="flex items-center justify-between px-4 pt-10 pb-3">
        <button onClick={onClose} className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-black text-gray-900 dark:text-white flex-1 text-center px-4 leading-tight line-clamp-2">
          {name}
        </h1>
        <div className="w-10" />
      </div>
    </motion.div>
  );
}
