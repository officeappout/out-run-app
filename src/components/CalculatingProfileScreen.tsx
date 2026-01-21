'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

interface CalculatingProfileScreenProps {
  workoutType?: string;
  userName?: string;
  onComplete: () => void;
}

/**
 * Calculating Profile Screen Component
 * Displays the Smart Lemur character calculating the user's fitness profile
 * with animated thinking phases and video animation.
 */
export default function CalculatingProfileScreen({
  workoutType = 'כושר',
  userName = 'OUTer',
  onComplete,
}: CalculatingProfileScreenProps) {
  const [currentPhase, setCurrentPhase] = useState(0);

  // Thinking phases in Hebrew
  const thinkingPhases = [
    'מנתח את הנתונים שלך...',
    `בודק התאמה ל${workoutType}...`,
    'בונה את תוכנית האימון...',
    'זהו! הכל מוכן.',
  ];

  // Animation duration: 10 seconds total (2.5 seconds per phase)
  const PHASE_DURATION = 2500; // 2.5 seconds per phase
  const TOTAL_DURATION = thinkingPhases.length * PHASE_DURATION;

  useEffect(() => {
    // Cycle through thinking phases
    const phaseInterval = setInterval(() => {
      setCurrentPhase((prev) => {
        if (prev < thinkingPhases.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, PHASE_DURATION);

    // Call onComplete when animation finishes
    const completeTimer = setTimeout(() => {
      onComplete();
    }, TOTAL_DURATION);

    return () => {
      clearInterval(phaseInterval);
      clearTimeout(completeTimer);
    };
  }, [thinkingPhases.length, TOTAL_DURATION, onComplete]);

  return (
    <div
      dir="rtl"
      className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 relative overflow-hidden"
    >
      {/* Subtle Background Pattern - Math Symbols & Graphs */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        {/* Math symbols floating */}
        <div className="absolute top-20 right-10 text-6xl font-mono">∑</div>
        <div className="absolute top-40 left-20 text-5xl font-mono">∫</div>
        <div className="absolute bottom-32 right-32 text-4xl font-mono">√</div>
        <div className="absolute bottom-20 left-10 text-5xl font-mono">π</div>
        <div className="absolute top-1/2 left-1/4 text-3xl font-mono">α</div>
        <div className="absolute top-1/3 right-1/3 text-4xl font-mono">β</div>
        
        {/* Graph-like lines */}
        <svg className="absolute top-0 left-0 w-full h-full" viewBox="0 0 400 400">
          <path
            d="M 50 200 Q 150 100, 250 150 T 450 200"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            opacity="0.2"
          />
          <path
            d="M 50 250 Q 150 180, 250 220 T 450 250"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            opacity="0.15"
          />
        </svg>
      </div>

      {/* Main Content Container - Vertical Stack (Bubble Above, Character Below) */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 max-w-lg w-full gap-8">
        
        {/* Speech Bubble - Above Character */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
          className="relative w-full max-w-md"
        >
          {/* Speech Bubble Container with thick borders (Duolingo-style) */}
          <div className="bg-white rounded-3xl p-8 shadow-2xl border-8 border-slate-900 relative">
            {/* Speech Bubble Tail (pointing DOWN to character, positioned on LEFT) */}
            <div
              className="absolute bottom-0 left-10 transform translate-y-full"
              style={{
                width: 0,
                height: 0,
                borderLeft: '24px solid transparent',
                borderRight: '24px solid transparent',
                borderTop: '36px solid #0f172a',
              }}
            />
            <div
              className="absolute bottom-0 left-10 transform translate-y-full -mt-1"
              style={{
                width: 0,
                height: 0,
                borderLeft: '20px solid transparent',
                borderRight: '20px solid transparent',
                borderTop: '32px solid white',
              }}
            />

            {/* Speech Bubble Content - Animated Text */}
            <div className="relative z-10 min-h-[60px] flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentPhase}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                  className="text-xl font-bold text-slate-900 font-simpler text-center"
                >
                  {thinkingPhases[currentPhase]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Character Section - Smart Lemur with Video Overlay */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.5, ease: 'easeOut' }}
          className="relative"
        >
          {/* Container for Video and Image (exactly overlapping) */}
          <div className="relative w-56 h-64">
            {/* Static Image - Base Layer (fallback if video doesn't load) */}
            <div className="absolute inset-0 w-full h-full flex items-center justify-center z-0 pointer-events-none">
              <Image
                src="/assets/lemur/smart-lemur.png"
                alt="Smart Lemur calculating"
                width={224}
                height={256}
                className="object-contain drop-shadow-2xl"
                style={{
                  filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))',
                }}
                priority
                onError={(e) => {
                  // Fallback if image doesn't exist - hide it
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>

            {/* Video Element - Overlay Layer (plays on top of image) */}
            <video
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none"
              style={{
                filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))',
              }}
            >
              <source src="/assets/videos/lemur-animation.mp4" type="video/mp4" />
              {/* If video doesn't load, it will be hidden and static image will show */}
            </video>
          </div>
        </motion.div>
      </div>

      {/* Decorative Bottom Gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-blue-100/30 to-transparent pointer-events-none" />
    </div>
  );
}
