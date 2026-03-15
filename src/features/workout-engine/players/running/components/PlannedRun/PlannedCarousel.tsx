'use client';

import { useState } from 'react';
import { motion, PanInfo } from 'framer-motion';
import PlannedGeneralMetrics from './PlannedGeneralMetrics';
import BlockCountdownPanel from './BlockCountdownPanel';

const slides = [
  { id: 'interval', component: BlockCountdownPanel },
  { id: 'general', component: PlannedGeneralMetrics },
] as const;

export default function PlannedCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slideWidthPercent = 100 / slides.length;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const threshold = 50;
    const velocity = info.velocity.x;

    if (Math.abs(velocity) > 500) {
      if (velocity < 0 && currentSlide < slides.length - 1) {
        setCurrentSlide((p) => p + 1);
      } else if (velocity > 0 && currentSlide > 0) {
        setCurrentSlide((p) => p - 1);
      }
    } else if (Math.abs(info.offset.x) > threshold) {
      if (info.offset.x < 0 && currentSlide < slides.length - 1) {
        setCurrentSlide((p) => p + 1);
      } else if (info.offset.x > 0 && currentSlide > 0) {
        setCurrentSlide((p) => p - 1);
      }
    }
  };

  return (
    <div
      className="relative w-full overflow-hidden flex flex-col"
      style={{ fontFamily: 'var(--font-simpler)', touchAction: 'pan-y' }}
    >
      <motion.div
        className="flex flex-1"
        animate={{ x: `-${currentSlide * slideWidthPercent}%` }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ width: `${slides.length * 100}%` }}
      >
        {slides.map((slide) => {
          const Component = slide.component;
          return (
            <motion.div
              key={slide.id}
              className="w-full flex-shrink-0"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              dragDirectionLock
              onDragEnd={handleDragEnd}
              style={{ width: `${slideWidthPercent}%`, touchAction: 'pan-y' }}
            >
              <div className="w-full h-[220px] flex flex-col items-stretch justify-center overflow-hidden">
                <Component />
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Pagination dots — pinned to very bottom */}
      <div className="flex justify-center gap-2 pb-3 pt-1">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={`h-1.5 rounded-full transition-all ${
              index === currentSlide ? 'bg-[#00ADEF] w-6' : 'bg-gray-300 w-1.5'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
