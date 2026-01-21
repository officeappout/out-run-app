"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProgram } from '@/features/admin/services/program.service';
import { getLevel } from '@/features/admin/services/level.service';
import { Program, Level } from '@/types/workout';
import { getOnboardingLocale, type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import { Check, ClipboardCheck, Cpu, Zap } from 'lucide-react';

interface ProgramResultProps {
  levelNumber: number;
  levelId?: string;
  programId?: string;
  userName: string;
  language?: OnboardingLanguage;
  onContinue: () => void;
}

// Confetti particle component
const ConfettiParticle = ({ delay, x, color }: { delay: number; x: number; color: string }) => {
  if (typeof window === 'undefined') return null;
  
  return (
    <motion.div
      className={`absolute w-3 h-3 ${color}`}
      style={{
        left: `${x}%`,
        top: '-10px',
      }}
      initial={{ y: 0, rotate: 0, opacity: 1 }}
      animate={{
        y: window.innerHeight + 100,
        rotate: 360,
        opacity: [1, 1, 0],
      }}
      transition={{
        duration: 2,
        delay,
        ease: 'easeOut',
      }}
    />
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

  const locale = getOnboardingLocale(language);
  const direction = language === 'he' ? 'rtl' : 'ltr';

  // Get header text
  const headerTemplate = locale?.common?.programReady || 'התוכנית שלך מוכנה, {name}!';
  const headerText = headerTemplate.includes('{name}') 
    ? headerTemplate.replace('{name}', userName)
    : headerTemplate;

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

  // Hide confetti after animation
  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3000);
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
  ];

  const confettiParticles = Array.from({ length: 30 }).map((_, i) => ({
    id: i,
    delay: Math.random() * 0.5,
    x: Math.random() * 100,
    color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
  }));

  // Icons configuration - localized labels
  const getLabels = (lang: OnboardingLanguage) => {
    if (lang === 'he') {
      return ['אבחון', 'התאמה', 'מוכן'];
    } else if (lang === 'ru') {
      return ['Оценка', 'Адаптация', 'Готово'];
    } else {
      return ['Assessment', 'Matching', 'Ready'];
    }
  };

  const labels = getLabels(language);
  const icons = [
    { Icon: ClipboardCheck, label: labels[0] }, // Assessment
    { Icon: Cpu, label: labels[1] }, // AI Build
    { Icon: Zap, label: labels[2] }, // Ready
  ];

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center font-simpler overflow-hidden" dir={direction}>
      {/* Icons and Success Progress Bar */}
      <div className="absolute top-0 left-0 right-0 px-5 py-3 z-20">
        {/* Icons Row */}
        <div className={`flex gap-1.5 mb-2 ${direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
          {icons.map(({ Icon, label }, index) => {
            // Icon 1 and 2 are active on ProgramResult screen
            const isActive = index < 2;
            const iconColor = isActive ? '#5BC2F2' : '#CBD5E1';
            
            return (
              <motion.div
                key={index}
                className="flex-1 flex flex-col items-center"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 + 0.3, duration: 0.3 }}
              >
                <motion.div
                  animate={{ 
                    scale: isActive ? 1 : 0.9,
                  }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  <Icon 
                    size={18} 
                    strokeWidth={2}
                    className="transition-colors duration-300"
                    style={{ color: iconColor }}
                  />
                </motion.div>
                <span 
                  className="text-[10px] font-medium mt-1 font-simpler transition-colors duration-300"
                  style={{ color: iconColor }}
                >
                  {label}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Progress Bars Row */}
        <div className={`flex gap-1.5 ${direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
          {[0, 1, 2].map((index) => {
            if (index === 0) {
              // First segment: 100% full with success checkmark
              return (
                <motion.div
                  key={index}
                  className="h-1.5 flex-1 rounded-full bg-[#5BC2F2] relative overflow-hidden flex items-center justify-center"
                  initial={{ backgroundColor: '#5BC2F2' }}
                  animate={{ backgroundColor: '#10b981' }} // Green for success
                  transition={{ delay: 0.5, duration: 0.5 }}
                >
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 1, type: 'spring', stiffness: 200 }}
                    className="absolute"
                  >
                    <Check className="w-3 h-3 text-white" />
                  </motion.div>
                </motion.div>
              );
            } else if (index === 1) {
              // Second segment: Active but not filled (AI Build in progress)
              return (
                <motion.div
                  key={index}
                  className="h-1.5 flex-1 rounded-full bg-[#5BC2F2]/40"
                  initial={{ backgroundColor: 'rgba(91, 194, 242, 0.2)' }}
                  animate={{ backgroundColor: 'rgba(91, 194, 242, 0.4)' }}
                  transition={{ delay: 0.8, duration: 0.5 }}
                />
              );
            } else {
              // Segment 3: Empty (future)
              return (
                <div
                  key={index}
                  className="h-1.5 flex-1 rounded-full bg-[#5BC2F2]/20"
                />
              );
            }
          })}
        </div>
      </div>

      {/* Confetti Effect */}
      <AnimatePresence>
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none">
            {confettiParticles.map((particle) => (
              <ConfettiParticle
                key={particle.id}
                delay={particle.delay}
                x={particle.x}
                color={particle.color}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Light Burst Effect */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(91, 194, 242, 0.2) 0%, rgba(91, 194, 242, 0.1) 30%, transparent 70%)',
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 2, opacity: [0, 0.5, 0] }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />

      <div className={`relative z-10 w-full max-w-md px-6 ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-black text-black leading-tight font-simpler">
            {headerText}
          </h1>
        </motion.div>

        {/* Level Badge */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            delay: 0.5, 
            type: 'spring', 
            stiffness: 200, 
            damping: 15 
          }}
          className="mb-8 flex justify-center"
        >
          <div className="relative">
            {/* Glowing ring */}
            <motion.div
              className="absolute inset-0 rounded-full bg-[#5BC2F2] blur-2xl opacity-30"
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
            
            {/* Badge Card */}
            <div className="relative bg-white rounded-full shadow-2xl border-4 border-[#5BC2F2] p-8">
              <div className="text-7xl font-black text-[#5BC2F2] mb-2">
                {levelNumber}
              </div>
              <div className="text-lg font-bold text-slate-700">
                {language === 'he' ? 'רמה' : language === 'ru' ? 'Уровень' : 'Level'}
                {level?.name && ` - ${level.name}`}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Program Details */}
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#5BC2F2] border-t-transparent"></div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="space-y-4"
          >
            {program && (
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                <h2 className="text-xl font-bold text-black mb-2 font-simpler">
                  {program.name}
                </h2>
                {program.description && (
                  <p className="text-slate-700 leading-relaxed font-simpler">
                    {program.description}
                  </p>
                )}
              </div>
            )}

            {level?.description && (
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                <p className="text-slate-700 leading-relaxed font-simpler">
                  {level.description}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* Continue Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="mt-12"
        >
          <button
            onClick={onContinue}
            className="w-full bg-[#5BC2F2] hover:bg-[#4ab0e0] text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-[#5BC2F2]/30 transition-all duration-200 active:scale-95 font-simpler"
          >
            {language === 'he' ? 'התחל את המסע' : language === 'ru' ? 'Начать путешествие' : 'Start the Journey'}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
