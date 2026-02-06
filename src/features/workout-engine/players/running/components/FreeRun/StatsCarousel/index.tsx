'use client';

import { useState } from 'react';
import { motion, PanInfo } from 'framer-motion';
import MainMetrics from './MainMetrics';
import LapMetrics from './LapMetrics';

export default function StatsCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    { id: 'main', component: MainMetrics },
    { id: 'lap', component: LapMetrics },
  ];

  // תיקון חישוב המרחק: אנחנו זזים באחוזים יחסיים למספר הסליידים
  const slideWidthPercent = 100 / slides.length;

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 50;
    const velocity = info.velocity.x;

    if (Math.abs(velocity) > 500) {
      if (velocity < 0 && currentSlide < slides.length - 1) {
        setCurrentSlide((prev) => prev + 1);
      } else if (velocity > 0 && currentSlide > 0) {
        setCurrentSlide((prev) => prev - 1);
      }
    } else if (Math.abs(info.offset.x) > threshold) {
      if (info.offset.x < 0 && currentSlide < slides.length - 1) {
        setCurrentSlide((prev) => prev + 1);
      } else if (info.offset.x > 0 && currentSlide > 0) {
        setCurrentSlide((prev) => prev - 1);
      }
    }
  };

  return (
    <div className="relative w-full overflow-hidden" style={{ fontFamily: 'var(--font-simpler)' }}>
      <motion.div
        className="flex"
        animate={{
          // תיקון קריטי: זזים רק ב-50% בכל פעם (כי יש 2 סליידים)
          x: `-${currentSlide * slideWidthPercent}%`,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
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
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              style={{ width: `${slideWidthPercent}%` }}
            >
              {/* הוספת flex וגובה מינימלי כדי שהתוכן לא יקרוס */}
              <div className="w-full min-h-[220px] flex flex-col items-stretch">
                <Component />
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Pagination Dots */}
      <div className="flex justify-center gap-2 mt-2 pb-2">
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