/**
 * StreakScreen Component
 * Daily activity summary with flame differentiation based on activity type
 * Inspired by Duolingo streak mechanics
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Footprints, Mountain, TrendingUp, Calendar } from 'lucide-react';
import type { ActivityType } from '../store/useProgressionStore';

interface StreakScreenProps {
  activityType: ActivityType;
  currentStreak: number;
  stepsToday: number;
  floorsToday: number;
  stepGoal: number;
  floorGoal: number;
  coinsEarned?: number;
  onClose?: () => void;
}

export default function StreakScreen({
  activityType,
  currentStreak,
  stepsToday,
  floorsToday,
  stepGoal,
  floorGoal,
  coinsEarned = 0,
  onClose,
}: StreakScreenProps) {
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  // Get window size safely (only in browser)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      const handleResize = () => {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);
  // Configuration for each activity type
  const activityConfig = {
    super: {
      flameSize: 'w-40 h-40',
      flameColor: 'text-orange-500',
      glowClass: 'shadow-[0_0_60px_rgba(251,146,60,0.6)]',
      animation: 'scale-110',
      sparkles: true,
      title: 'אימון מלא!',
      subtitle: 'הלהבה שלך בוערת חזק! 🔥',
      message: 'השלמת אימון מלא וזכית בתגמול',
      bgGradient: 'from-orange-50 to-amber-50',
      showCoins: true,
    },
    micro: {
      flameSize: 'w-32 h-32',
      flameColor: 'text-cyan-500',
      glowClass: 'shadow-[0_0_40px_rgba(0,229,255,0.5)]',
      animation: 'scale-105',
      sparkles: false,
      title: 'יעד יומי הושג!',
      subtitle: 'המומנטום נשמר! 💪',
      message: 'המשך כך והמטרה תתקרב',
      bgGradient: 'from-cyan-50 to-blue-50',
      showCoins: true,
    },
    survival: {
      flameSize: 'w-24 h-24',
      flameColor: 'text-amber-400',
      glowClass: 'shadow-[0_0_20px_rgba(251,191,36,0.3)]',
      animation: 'scale-100',
      sparkles: false,
      title: 'הרצף נשמר',
      subtitle: 'הבסיס הושג - הרצף ממשיך! ✨',
      message: 'מחר נלך על היעד המלא',
      bgGradient: 'from-amber-50 to-yellow-50',
      showCoins: false,
    },
    none: {
      flameSize: 'w-20 h-20',
      flameColor: 'text-gray-400',
      glowClass: '',
      animation: 'scale-95',
      sparkles: false,
      title: 'מחר ניסיון חדש',
      subtitle: 'כל יום הוא הזדמנות חדשה',
      message: 'הרצף התאפס, אבל אתה יכול להתחיל מחדש',
      bgGradient: 'from-gray-50 to-slate-50',
      showCoins: false,
    },
  };

  const config = activityConfig[activityType];

  const stepProgress = Math.min((stepsToday / stepGoal) * 100, 100);
  const floorProgress = Math.min((floorsToday / floorGoal) * 100, 100);

  return (
    <div className={`fixed inset-0 z-[400] bg-gradient-to-b ${config.bgGradient} flex flex-col items-center justify-center p-6`}>
      {/* Sparkles Animation (only for 'super') */}
      {config.sparkles && windowSize.width > 0 && windowSize.height > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                y: Math.random() * windowSize.height, 
                x: Math.random() * windowSize.width,
                opacity: 0,
                scale: 0 
              }}
              animate={{
                y: [null, Math.random() * windowSize.height],
                x: [null, Math.random() * windowSize.width],
                opacity: [0, 1, 0],
                scale: [0, 1, 0],
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                delay: Math.random() * 2,
                repeat: Infinity,
              }}
              className="absolute text-yellow-400 text-2xl"
            >
              ✨
            </motion.div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center max-w-md w-full">
        {/* Flame Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.8, type: 'spring' }}
          className="relative mb-8"
        >
          <motion.div
            animate={{
              scale: activityType === 'super' ? [1, 1.1, 1] : [1, 1.05, 1],
            }}
            transition={{
              duration: activityType === 'super' ? 1.5 : 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className={`${config.flameSize} ${config.glowClass} rounded-full bg-white flex items-center justify-center`}
          >
            <Flame className={`${config.flameColor} ${config.flameSize} drop-shadow-lg`} fill="currentColor" />
          </motion.div>

          {/* Streak Badge */}
          {currentStreak > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className="absolute -bottom-2 -right-2 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-full w-16 h-16 flex flex-col items-center justify-center shadow-lg"
            >
              <span className="text-2xl font-black">{currentStreak}</span>
              <span className="text-[10px] font-bold">ימים</span>
            </motion.div>
          )}
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-4xl font-black text-gray-900 mb-2 text-center"
        >
          {config.title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-lg text-gray-600 mb-2 text-center font-semibold"
        >
          {config.subtitle}
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-sm text-gray-500 mb-8 text-center"
        >
          {config.message}
        </motion.p>

        {/* Coins Badge (only if showCoins) */}
        <AnimatePresence>
          {config.showCoins && coinsEarned > 0 && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ delay: 0.6, type: 'spring' }}
              className="bg-yellow-100 border-2 border-yellow-400 rounded-full px-6 py-3 flex items-center gap-3 mb-8 shadow-lg"
            >
              <span className="w-8 h-8 bg-yellow-400 rounded-full border-2 border-white shadow-sm" />
              <div className="flex flex-col">
                <span className="text-2xl font-black text-yellow-700">+{coinsEarned}</span>
                <span className="text-xs font-bold text-yellow-600">מטבעות</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="w-full space-y-4 bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-lg"
        >
          {/* Steps Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Footprints className="w-5 h-5 text-cyan-500" />
                <span className="text-sm font-bold text-gray-700">צעדים</span>
              </div>
              <span className="text-sm font-bold text-gray-900">
                {stepsToday.toLocaleString()} / {stepGoal.toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${stepProgress}%` }}
                transition={{ duration: 1, delay: 0.8 }}
                className="bg-gradient-to-r from-cyan-400 to-cyan-600 h-full rounded-full"
              />
            </div>
          </div>

          {/* Floors Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mountain className="w-5 h-5 text-purple-500" />
                <span className="text-sm font-bold text-gray-700">קומות</span>
              </div>
              <span className="text-sm font-bold text-gray-900">
                {floorsToday} / {floorGoal}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${floorProgress}%` }}
                transition={{ duration: 1, delay: 0.9 }}
                className="bg-gradient-to-r from-purple-400 to-purple-600 h-full rounded-full"
              />
            </div>
          </div>
        </motion.div>

        {/* Close Button */}
        {onClose && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            onClick={onClose}
            className="mt-8 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold py-4 px-8 rounded-2xl shadow-lg active:scale-95 transition-transform"
          >
            המשך
          </motion.button>
        )}
      </div>
    </div>
  );
}
