"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProgram } from '@/features/content/programs';
import { getLevel } from '@/features/content/programs';
import { Program, Level } from '@/features/content/programs';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { Sparkles } from 'lucide-react';
import { useOnboardingStore } from '../store/useOnboardingStore';
import OnboardingStoryBar from './OnboardingStoryBar';
import { TOTAL_PHASES, STRENGTH_PHASES, STRENGTH_LABELS } from '../constants/onboarding-phases';

interface ProgramResultProps {
  levelNumber: number;
  levelId?: string;
  programId?: string;
  userName: string;
  language?: OnboardingLanguage;
  onContinue: () => void;
}

// Confetti particle component
const ConfettiParticle = ({ delay, x, color, windowHeight }: { delay: number; x: number; color: string; windowHeight: number }) => {
  if (typeof window === 'undefined' || windowHeight === 0) return null;
  
  return (
    <motion.div
      className={`absolute w-3 h-3 ${color} rounded-sm`}
      style={{
        left: `${x}%`,
        top: '-10px',
        transform: `rotate(${Math.random() * 360}deg)`,
      }}
      initial={{ y: 0, rotate: 0, opacity: 1 }}
      animate={{
        y: windowHeight + 100,
        rotate: 720,
        opacity: [1, 1, 0],
      }}
      transition={{
        duration: 2.5,
        delay,
        ease: 'easeOut',
      }}
    />
  );
};

// Sparkle effect component
const SparkleEffect = ({ delay, angle, distance }: { delay: number; angle: number; distance: number }) => {
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;
  
  return (
    <motion.div
      className="absolute w-2 h-2"
      style={{
        left: '50%',
        top: '50%',
      }}
      initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
      animate={{ 
        x: [0, x, x * 1.2],
        y: [0, y, y * 1.2],
        scale: [0, 1.2, 0],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: 1.5,
        delay,
        ease: 'easeOut',
      }}
    >
      <Sparkles className="w-4 h-4 text-[#5BC2F2]" />
    </motion.div>
  );
};

// Circular Progress Gauge Component with counting animation
const CircularGauge = ({ 
  targetPercentage, 
  levelNumber, 
  totalLevels = 25,
  language = 'he',
  onCountComplete,
}: { 
  targetPercentage: number; 
  levelNumber: number;
  totalLevels?: number;
  language?: OnboardingLanguage;
  onCountComplete?: () => void;
}) => {
  const [displayPercentage, setDisplayPercentage] = useState(0);
  const [arcPercentage, setArcPercentage] = useState(0);
  const countCompleteRef = useRef(false);
  
  const size = 200;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (arcPercentage / 100) * circumference;

  const levelLabel = language === 'he' ? 'רמה' : language === 'ru' ? 'Уровень' : 'Level';

  // Counting animation
  useEffect(() => {
    const countDuration = 1500; // 1.5 seconds
    const startTime = Date.now();
    const startDelay = 800; // Delay before counting starts
    
    const timer = setTimeout(() => {
      const animate = () => {
        const elapsed = Date.now() - startTime - startDelay;
        if (elapsed < 0) {
          requestAnimationFrame(animate);
          return;
        }
        
        const progress = Math.min(elapsed / countDuration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.round(eased * targetPercentage);
        
        setDisplayPercentage(currentValue);
        setArcPercentage(eased * targetPercentage);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else if (!countCompleteRef.current) {
          countCompleteRef.current = true;
          onCountComplete?.();
        }
      };
      
      requestAnimationFrame(animate);
    }, startDelay);
    
    return () => clearTimeout(timer);
  }, [targetPercentage, onCountComplete]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Background glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(91, 194, 242, 0.2) 0%, transparent 60%)',
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.4, 0.7, 0.4],
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
        />
        
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.05s ease-out' }}
        />
        
        {/* Gradient definition */}
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5BC2F2" />
            <stop offset="50%" stopColor="#00E5FF" />
            <stop offset="100%" stopColor="#5BC2F2" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div
          className="flex items-baseline"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
        >
          <span className="text-6xl font-black text-slate-900 leading-none">
            {displayPercentage}
          </span>
          <span className="text-xl font-bold text-slate-400 mr-0.5">%</span>
        </motion.div>
        <motion.span 
          className="text-sm font-semibold text-slate-500 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          {levelLabel} {levelNumber}/{totalLevels}
        </motion.span>
      </div>
    </div>
  );
};

export default function ProgramResult({
  levelNumber,
  levelId,
  programId,
  userName,
  language = 'he',
  onContinue,
}: ProgramResultProps) {
  const [program, setProgram] = useState<Program | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(true);
  const [showSparkles, setShowSparkles] = useState(false);
  const [windowHeight, setWindowHeight] = useState(0);

  const locale = getOnboardingLocale(language);
  const direction = language === 'he' ? 'rtl' : 'ltr';

  // Calculate actual percentage based on level (level 1 = 1%, level 2 = 2%, etc.)
  // This creates a tiny arc for beginners, showing room for growth
  const actualPercentage = Math.max(1, Math.min(levelNumber, 100));
  
  // Debug: Log program data to verify name injection
  useEffect(() => {
    console.log('🎯 ProgramResult - Program Data:', { program, level, levelNumber, programId, levelId });
  }, [program, level, levelNumber, programId, levelId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [programData, levelData] = await Promise.all([
          programId ? getProgram(programId) : Promise.resolve(null),
          levelId ? getLevel(levelId) : Promise.resolve(null),
        ]);
        setProgram(programData);
        setLevel(levelData);
      } catch (error) {
        console.error('Error fetching program/level:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [programId, levelId]);

  // Get window height safely (only in browser)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowHeight(window.innerHeight);
      const handleResize = () => {
        setWindowHeight(window.innerHeight);
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Hide confetti after animation
  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  // Generate confetti particles
  const confettiColors = [
    'bg-[#5BC2F2]',
    'bg-[#00E5FF]',
    'bg-[#00B8D4]',
    'bg-yellow-400',
    'bg-green-400',
    'bg-purple-400',
    'bg-pink-400',
  ];

  const confettiParticles = Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    delay: Math.random() * 0.8,
    x: Math.random() * 100,
    color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
  }));

  // Generate sparkle positions (around the card)
  const sparklePositions = Array.from({ length: 8 }).map((_, i) => ({
    id: i,
    angle: (i / 8) * Math.PI * 2,
    distance: 120 + Math.random() * 40,
    delay: 2.3 + i * 0.1,
  }));

  // Get dynamic program name
  const getProgramName = () => {
    if (program?.name) return program.name;
    if (level?.name) {
      if (language === 'he') return `תוכנית ${level.name}`;
      if (language === 'ru') return `Программа ${level.name}`;
      return `${level.name} Program`;
    }
    if (language === 'he') return 'תוכנית אימונים מותאמת אישית';
    if (language === 'ru') return 'Персональная программа тренировок';
    return 'Personalized Training Program';
  };

  // Next level for motivation text
  const nextLevel = levelNumber + 1;
  
  // Get store action
  const setMajorRoadmapStep = useOnboardingStore((state) => state.setMajorRoadmapStep);
  
  // Localized text with dynamic level
  const texts = {
    he: {
      programHeader: getProgramName(),
      achievement: `כ-1,280 משתמשים התחילו בנקודה הזו - רובם הגיעו לרמה ${nextLevel} תוך פחות משבוע!`,
      continueButton: 'בואו נמשיך: התאמה לסגנון החיים',
    },
    en: {
      programHeader: getProgramName(),
      achievement: `About 1,280 users started here - most reached level ${nextLevel} within a week!`,
      continueButton: "Let's continue: Lifestyle Adaptation",
    },
    ru: {
      programHeader: getProgramName(),
      achievement: `Около 1 280 пользователей начали здесь - большинство достигли ${nextLevel} уровня за неделю!`,
      continueButton: 'Продолжим: Адаптация к стилю жизни',
    },
  };

  const t = texts[language] || texts.he;

  const handleCountComplete = () => {
    setShowSparkles(true);
    // Hide sparkles after animation
    setTimeout(() => setShowSparkles(false), 2000);
  };
  
  // Handle continue - set major step to 1 (התאמה לסגנון החיים) before navigating
  const handleContinueClick = () => {
    setMajorRoadmapStep(1); // Move to step 1 (התאמה לסגנון החיים)
    onContinue();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col font-simpler overflow-hidden"
      style={{
        background: 'linear-gradient(to bottom, #D8F3FF, #F8FDFF, white)',
      }}
      dir={direction}
    >
      {/* Unified 5-phase story bar — Phase 4 active */}
      <div className="absolute top-0 left-0 right-0 z-20" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <OnboardingStoryBar
          totalPhases={TOTAL_PHASES}
          currentPhase={STRENGTH_PHASES.RESULT}
          phaseLabel={STRENGTH_LABELS[STRENGTH_PHASES.RESULT]}
        />
      </div>

      {/* Confetti Effect */}
      <AnimatePresence>
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {confettiParticles.map((particle) => (
              <ConfettiParticle
                key={particle.id}
                delay={particle.delay}
                x={particle.x}
                color={particle.color}
                windowHeight={windowHeight}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Light Burst Effect */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 40%, rgba(91, 194, 242, 0.3) 0%, transparent 50%)',
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 2, opacity: [0, 0.8, 0] }}
        transition={{ duration: 2, ease: 'easeOut' }}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pt-16 pb-8 relative z-10">
        {/* Hero Card with Sparkle Effects Container */}
        <div className="relative">
          {/* Sparkle Effects */}
          <AnimatePresence>
            {showSparkles && (
              <div className="absolute inset-0 pointer-events-none">
                {sparklePositions.map((sparkle) => (
                  <SparkleEffect
                    key={sparkle.id}
                    delay={sparkle.delay}
                    angle={sparkle.angle}
                    distance={sparkle.distance}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
          
          {/* Hero Card */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
            className="w-full max-w-sm bg-white rounded-[40px] p-8 text-center"
            style={{
              boxShadow: '0 20px 50px rgba(91, 194, 242, 0.2), 0 8px 20px rgba(0, 0, 0, 0.08)',
            }}
          >
            {/* Program Header */}
            <motion.h2
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="text-2xl font-black text-slate-900 mb-6"
            >
              {t.programHeader}
            </motion.h2>

            {/* Circular Progress Gauge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="flex justify-center mb-6"
            >
              <CircularGauge
                targetPercentage={actualPercentage}
                levelNumber={levelNumber}
                totalLevels={25}
                language={language}
                onCountComplete={handleCountComplete}
              />
            </motion.div>

            {/* Achievement Text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.5, duration: 0.5 }}
              className="text-sm text-slate-500 leading-relaxed px-2"
            >
              {t.achievement}
            </motion.p>
          </motion.div>
        </div>

        {/* Continue Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.8, duration: 0.5 }}
          className="w-full max-w-sm mt-8 px-1"
        >
          <button
            onClick={handleContinueClick}
            className="w-full bg-[#5BC2F2] hover:bg-[#4ab0e0] text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-[#5BC2F2]/30 transition-all duration-200 active:scale-95"
          >
            {t.continueButton}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
