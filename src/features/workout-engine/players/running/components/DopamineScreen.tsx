"use client";
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '../../../core/store/useSessionStore';
import { useProgressionStore } from '@/features/user';

interface DopamineScreenProps {
  onContinue?: () => void;
}

export default function DopamineScreen({ onContinue }: DopamineScreenProps) {
  const router = useRouter();
  const { totalDistance } = useSessionStore();
  const { lastActivityType, coins } = useProgressionStore();
  const [totalCoins, setTotalCoins] = useState(0);
  const [activeBonus, setActiveBonus] = useState<string | null>(null);
  const [showContinue, setShowContinue] = useState(false);
  
  // רפרנס לאודיו כדי למנוע טעינה מחדש
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Check if this is a "super" activity (full workout)
  const isSuper = lastActivityType === 'super';

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
    }
    router.push('/home');
  };

  const bonusSteps = [
    { 
      id: 'dist', 
      label: isSuper ? 'בונוס אימון מלא! 🔥' : 'בונוס מרחק!', 
      amount: Math.floor(totalDistance * 10) + (isSuper ? 50 : 0), 
      icon: isSuper ? '🔥' : '🏃‍♂️', 
      delay: 0.5 
    },
    { id: 'speed', label: 'שיא מהירות!', amount: 25, icon: '⚡', delay: 1.5 },
    { id: 'daily', label: 'יעד יומי הושלם!', amount: 50, icon: '🎯', delay: 2.5 }
  ];

  useEffect(() => {
    // טעינת הסאונד
    audioRef.current = new Audio('/sounds/coin-clink.mp3');
    
    bonusSteps.forEach((step) => {
      setTimeout(() => {
        // 1. הפעלת סאונד
        if (audioRef.current) {
          audioRef.current.currentTime = 0; // חזרה להתחלה למקרה של צלילים מהירים
          audioRef.current.play().catch(e => console.log("Audio block:", e));
        }

        // 2. הפעלת רטט (Vibration API)
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(50); // רטט קצרצר של 50 מילי-שניות
        }

        setActiveBonus(step.label);
        setTotalCoins(prev => prev + step.amount);
      }, step.delay * 1000);
    });

    // Show continue button after all animations complete
    const lastStepDelay = bonusSteps[bonusSteps.length - 1].delay;
    setTimeout(() => {
      setShowContinue(true);
    }, (lastStepDelay + 1.5) * 1000); // Wait 1.5s after last bonus
  }, []);

  return (
    <div className={`fixed inset-0 z-[300] ${isSuper ? 'bg-gradient-to-b from-orange-50 to-amber-50' : 'bg-slate-50'} flex flex-col items-center justify-center overflow-hidden`}>
      {/* אנימציית המטבעות והלהבות הנופלים */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(isSuper ? 20 : 12)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ y: -100, x: Math.random() * 400 - 200, opacity: 0, rotate: 0 }}
            animate={{ y: 1000, opacity: [0, 1, 0], rotate: 360 }}
            transition={{ duration: 2.5, delay: Math.random() * 2, repeat: Infinity, ease: "linear" }}
            className="text-4xl shadow-glow"
          >
            {isSuper && i % 3 === 0 ? '🔥' : '💰'}
          </motion.div>
        ))}
      </div>
      
      {/* Stronger Flame Effect for 'super' workouts */}
      {isSuper && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={`sparkle-${i}`}
              initial={{ 
                y: Math.random() * window.innerHeight, 
                x: Math.random() * window.innerWidth,
                opacity: 0,
                scale: 0 
              }}
              animate={{
                y: [null, Math.random() * window.innerHeight],
                x: [null, Math.random() * window.innerWidth],
                opacity: [0, 1, 0],
                scale: [0, 1.5, 0],
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                delay: Math.random() * 2,
                repeat: Infinity,
              }}
              className="absolute text-orange-400 text-3xl"
            >
              ✨
            </motion.div>
          ))}
        </div>
      )}

      <motion.div className="relative z-10 flex flex-col items-center">
        {/* בועת הבונוס עם אנימציה קופצת */}
        <AnimatePresence mode="wait">
          {activeBonus && (
            <motion.div
              key={activeBonus}
              initial={{ scale: 0.5, y: 30, opacity: 0 }}
              animate={{ scale: 1.1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute -top-24 bg-white shadow-[0_10px_25px_rgba(0,0,0,0.1)] px-8 py-3 rounded-full border-2 border-blue-400 text-blue-600 font-black text-xl flex items-center gap-3"
            >
              <span className="bg-blue-50 w-8 h-8 rounded-full flex items-center justify-center">✨</span>
              <span>{activeBonus}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* המטבע המרכזי בעיצוב "כללית" - עם להבה חזקה ל-'super' */}
        <motion.div 
          animate={{ 
            scale: activeBonus ? [1, isSuper ? 1.2 : 1.15, 1] : 1,
            rotate: activeBonus ? [0, 2, -2, 0] : 0
          }}
          className={`w-72 h-72 bg-white rounded-full ${
            isSuper 
              ? 'shadow-[0_20px_80px_rgba(251,146,60,0.5)]' 
              : 'shadow-[0_20px_60px_rgba(0,178,255,0.25)]'
          } border-[10px] border-white flex flex-col items-center justify-center relative`}
        >
          {/* Flame Icon for Super Workouts */}
          {isSuper && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="absolute -top-8 -right-8"
            >
              <Flame className="w-16 h-16 text-orange-500 drop-shadow-lg" fill="currentColor" />
            </motion.div>
          )}
          {/* Progress Circle */}
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx="144" cy="144" r="130" fill="none" stroke="#f1f5f9" strokeWidth="10" />
            <motion.circle
              cx="144" cy="144" r="130"
              fill="none" stroke="#00B2FF" strokeWidth="14"
              strokeDasharray="816"
              initial={{ strokeDashoffset: 816 }}
              animate={{ strokeDashoffset: 816 - (816 * 0.85) }}
              transition={{ duration: 3, ease: "easeOut" }}
              strokeLinecap="round"
            />
          </svg>

          <div className="flex flex-col items-center z-10">
            <motion.span 
              key={totalCoins}
              initial={{ scale: 0.7 }}
              animate={{ scale: 1 }}
              className={`text-8xl font-[1000] tracking-tighter leading-none ${
                isSuper ? 'text-orange-600' : 'text-slate-800'
              }`}
            >
              {totalCoins}
            </motion.span>
            <div className="flex items-center gap-2 mt-2">
               <span className={`w-6 h-6 rounded-full border-2 border-white shadow-sm ${
                 isSuper ? 'bg-orange-400' : 'bg-yellow-400'
               }`} />
               <span className={`text-2xl font-black uppercase tracking-widest ${
                 isSuper ? 'text-orange-500' : 'text-blue-500'
               }`}>
                 {isSuper ? 'סופר!' : 'עמירם'}
               </span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-14 text-center"
        >
          <h2 className={`text-4xl font-black tracking-tight ${
            isSuper ? 'text-orange-600' : 'text-slate-800'
          }`}>
            {isSuper ? 'אימון מלא הושלם! 🔥' : 'אליפות! 🏆'}
          </h2>
          <p className={`font-bold mt-2 text-lg ${
            isSuper ? 'text-orange-400' : 'text-slate-400'
          }`}>
            {isSuper ? 'הלהבה שלך בוערת חזק!' : 'עמדת ביעד הצעדים השבועי!'}
          </p>
        </motion.div>

        {/* Continue Button */}
        <AnimatePresence>
          {showContinue && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={handleContinue}
              className={`mt-10 px-12 py-5 rounded-2xl font-black text-xl text-white shadow-2xl active:scale-95 transition-transform ${
                isSuper 
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 shadow-orange-500/40' 
                  : 'bg-gradient-to-r from-[#00B2FF] to-cyan-500 shadow-cyan-500/40'
              }`}
            >
              המשך לדף הבית
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}