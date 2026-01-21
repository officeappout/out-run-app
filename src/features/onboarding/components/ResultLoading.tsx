"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ResultLoadingProps {
  targetLevel: number; // The final level number to count to
  onComplete: () => void;
  language?: 'he' | 'en' | 'ru';
}

export default function ResultLoading({ targetLevel, onComplete, language = 'he' }: ResultLoadingProps) {
  const [currentNumber, setCurrentNumber] = useState(1);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (currentNumber >= targetLevel) {
      setIsComplete(true);
      // Wait a bit after reaching target, then call onComplete
      const timeout = setTimeout(() => {
        onComplete();
      }, 500);
      return () => clearTimeout(timeout);
    }

    // Calculate duration: 4 seconds total, split evenly across all numbers
    const totalNumbers = Math.max(targetLevel, 1);
    const duration = 4000; // 4 seconds
    const interval = duration / totalNumbers;
    
    // Speed up as we get closer (easing effect)
    const progress = currentNumber / targetLevel;
    const easeFactor = 1 - (progress * 0.7); // Slow down at the end
    const adjustedInterval = Math.max(interval * easeFactor, 30); // Minimum 30ms

    const timer = setTimeout(() => {
      setCurrentNumber((prev) => Math.min(prev + 1, targetLevel));
    }, adjustedInterval);

    return () => clearTimeout(timer);
  }, [currentNumber, targetLevel, onComplete]);

  // Scanning line effect
  const scanningLineVariants = {
    animate: {
      y: ['0%', '100%', '0%'],
      opacity: [0.3, 0.8, 0.3],
    },
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center font-simpler">
      {/* Scanning Effect Background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-b from-transparent via-[#5BC2F2]/10 to-transparent"
          variants={scanningLineVariants}
          animate="animate"
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      {/* Central Number Display */}
      <div className="relative z-10 text-center">
        {/* Pulse ring around number */}
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-[#5BC2F2]"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.5, 0, 0.5],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          style={{
            width: '200px',
            height: '200px',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Number Display */}
        <motion.div
          key={currentNumber}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.2, opacity: 0 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 25,
          }}
          className="relative"
        >
          <div className="text-9xl font-black text-[#5BC2F2] mb-4">
            {currentNumber}
          </div>
        </motion.div>

        {/* Level Label */}
        <div className="text-xl font-bold text-slate-700 mt-4">
          {language === 'he' ? 'רמה' : language === 'ru' ? 'Уровень' : 'Level'}
        </div>

        {/* Scanning dots */}
        <div className="flex gap-2 justify-center mt-8">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-[#5BC2F2]"
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
