"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface ResultLoadingProps {
  targetLevel: number;
  onComplete: () => void;
  language?: 'he' | 'en' | 'ru';
}

// Dynamic analysis phrases
const ANALYSIS_PHRASES = {
  he: [
    "מנתח את מספר המתחים...",
    "מחשב את נפח האימון האופטימלי...",
    "בונה את פרופיל האתלט שלך...",
    "מתאים תוכנית אישית...",
  ],
  en: [
    "Analyzing your movements...",
    "Calculating optimal training volume...",
    "Building your athlete profile...",
    "Customizing your personal program...",
  ],
  ru: [
    "Анализируем ваши движения...",
    "Рассчитываем оптимальный объем...",
    "Создаем ваш профиль атлета...",
    "Подбираем персональную программу...",
  ],
};

export default function ResultLoading({ targetLevel, onComplete, language = 'he' }: ResultLoadingProps) {
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [progress, setProgress] = useState(30); // Start at 30% (personal details done)
  
  const phrases = ANALYSIS_PHRASES[language] || ANALYSIS_PHRASES.he;
  const direction = language === 'he' ? 'rtl' : 'ltr';

  // Cycle through phrases every 800ms
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPhraseIndex((prev) => (prev + 1) % phrases.length);
    }, 800);
    return () => clearInterval(interval);
  }, [phrases.length]);

  // Animate progress from 30% to 100% over 3 seconds, then call onComplete
  useEffect(() => {
    const totalDuration = 3000; // 3 seconds
    const startProgress = 30;
    const endProgress = 100;
    const startTime = Date.now();

    const animateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progressRatio = Math.min(elapsed / totalDuration, 1);
      // Easing: ease-out
      const eased = 1 - Math.pow(1 - progressRatio, 3);
      const currentProgress = startProgress + (endProgress - startProgress) * eased;
      
      setProgress(currentProgress);

      if (progressRatio < 1) {
        requestAnimationFrame(animateProgress);
      } else {
        // Wait a bit after reaching 100%, then call onComplete
        setTimeout(() => {
          onComplete();
        }, 500);
      }
    };

    requestAnimationFrame(animateProgress);
  }, [onComplete]);

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col items-center justify-center font-simpler overflow-hidden"
      style={{
        background: 'linear-gradient(to bottom, #D8F3FF, #F8FDFF, white)',
      }}
      dir={direction}
    >
      {/* 3-Segment Progress Bar at top */}
      <div className="absolute top-0 left-0 right-0 px-4 pt-3 pb-2">
        <div className={`flex gap-1.5 ${direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
          {[0, 1, 2].map((index) => {
            // In RTL: index 0 is rightmost (phase 1), in LTR: index 0 is leftmost (phase 1)
            const segmentPhase = direction === 'rtl' ? 2 - index : index;
            let fillPercent = 0;
            
            if (segmentPhase === 0) {
              // Phase 1 - filling to 100% during calculation
              fillPercent = progress;
            } else {
              // Future phases
              fillPercent = 0;
            }
            
            return (
              <div
                key={index}
                className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden"
              >
                <motion.div
                  className="h-full rounded-full bg-[#5BC2F2]"
                  initial={{ width: '30%' }}
                  animate={{ width: `${fillPercent}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Central Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Pulsing OUT Logo */}
        <motion.div
          className="relative mb-12"
          animate={{
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {/* Outer glow ring */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              width: '160px',
              height: '160px',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(91, 194, 242, 0.3) 0%, transparent 70%)',
            }}
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          
          {/* OUT Logo */}
          <h1 className="text-6xl font-black text-[#5BC2F2] tracking-tight italic drop-shadow-lg">
            OUT
          </h1>
        </motion.div>

        {/* Dynamic Analysis Text */}
        <div className="h-8 relative overflow-hidden">
          <motion.p
            key={currentPhraseIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="text-lg font-medium text-slate-600 text-center"
          >
            {phrases[currentPhraseIndex]}
          </motion.p>
        </div>

        {/* Animated dots */}
        <div className="flex gap-2 justify-center mt-8">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-[#5BC2F2]"
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [1, 1.3, 1],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
