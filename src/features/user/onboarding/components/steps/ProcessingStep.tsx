'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '../../store/useOnboardingStore';

// Persona ID → Hebrew label map
const PERSONA_LABELS: Record<string, string> = {
  parent: 'הורה',
  student: 'סטודנט/ית',
  pupil: 'תלמיד/ה',
  office_worker: 'עובד/ת משרד',
  reservist: 'מילואימניק/ית',
  soldier: 'חייל/ת',
  vatikim: 'גיל הזהב',
  pro_athlete: 'ספורטאי/ת קצה',
};

interface ProcessingStepProps {
  onNext: () => void;
}

export default function ProcessingStep({ onNext }: ProcessingStepProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { data } = useOnboardingStore();

  // Resolve persona label from onboarding data
  const personaId = (data as any).selectedPersonaId || (data as any).selectedPersonaIds?.[0] || '';
  const personaLabel = PERSONA_LABELS[personaId] || 'המשתמש';

  const MESSAGES = [
    'מנתח העדפות אימון...',
    `בונה תוכנית מותאמת לפרסונת ${personaLabel}...`,
    'מחשב עומסים אופטימליים...',
    'מייצר הצהרת בריאות חתומה...',
    'מכין את לוח הבקרה האישי שלך...',
  ];

  // Cycle messages every 900ms
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 900);
    return () => clearInterval(interval);
  }, [MESSAGES.length]);

  // Smooth progress bar (0 → 100 over 4.5s)
  useEffect(() => {
    const start = Date.now();
    const duration = 4500;

    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);
      if (elapsed < duration) {
        timerRef.current = setTimeout(tick, 16); // ~60fps
      }
    };

    tick();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Auto-advance after 4.5s
  useEffect(() => {
    const timeout = setTimeout(() => {
      onNext();
    }, 4500);
    return () => clearTimeout(timeout);
  }, [onNext]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0F172A] overflow-hidden" dir="rtl">
      {/* Ambient glow layers */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#00F0FF]/5 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-[#0047FF]/8 rounded-full blur-[100px] animate-pulse" />
      </div>

      {/* Central data-viz animation */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        className="relative mb-12"
      >
        {/* Outer ring */}
        <svg width="140" height="140" viewBox="0 0 140 140" className="animate-[spin_6s_linear_infinite]">
          <circle
            cx="70" cy="70" r="64"
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth="1.5"
            strokeDasharray="8 12"
            opacity="0.3"
          />
          <defs>
            <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00F0FF" />
              <stop offset="100%" stopColor="#0047FF" />
            </linearGradient>
          </defs>
        </svg>

        {/* Middle ring */}
        <svg
          width="140" height="140" viewBox="0 0 140 140"
          className="absolute inset-0 animate-[spin_4s_linear_infinite_reverse]"
        >
          <circle
            cx="70" cy="70" r="52"
            fill="none"
            stroke="#00F0FF"
            strokeWidth="2"
            strokeDasharray="6 18"
            opacity="0.25"
          />
        </svg>

        {/* Inner pulsing core */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00F0FF] to-[#0047FF] shadow-[0_0_40px_rgba(0,240,255,0.35)]"
          />
        </div>

        {/* Orbiting dot */}
        <svg
          width="140" height="140" viewBox="0 0 140 140"
          className="absolute inset-0 animate-[spin_3s_linear_infinite]"
        >
          <circle cx="70" cy="10" r="3" fill="#00F0FF" opacity="0.8">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite" />
          </circle>
        </svg>
      </motion.div>

      {/* Cycling message */}
      <div className="h-8 relative w-full max-w-sm overflow-hidden px-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="text-[#00F0FF] font-medium text-sm text-center absolute w-full px-6"
          >
            {MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="w-56 h-1 bg-white/5 rounded-full mt-10 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#00F0FF] to-[#0047FF]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Subtle bottom tagline */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-10 text-white/30 text-xs tracking-widest uppercase"
      >
        OUT &mdash; Run Your World
      </motion.p>
    </div>
  );
}
