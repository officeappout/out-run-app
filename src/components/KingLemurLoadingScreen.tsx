'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';

interface KingLemurLoadingScreenProps {
  userName?: string;
  workoutType?: string;
  goal?: string;
}

/**
 * King Lemur Loading Screen Component
 * Displays a personalized transition screen with the king lemur character
 * and dynamic Hebrew text based on user data.
 */
export default function KingLemurLoadingScreen({
  userName = 'OUTer',
  workoutType = 'כושר',
  goal = 'להישאר פעיל',
}: KingLemurLoadingScreenProps) {
  return (
    <div
      dir="rtl"
      className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 relative overflow-hidden"
    >
      {/* Subtle Background Pattern - Fitness Elements */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 right-10 w-32 h-32 border-2 border-slate-400 rounded-full"></div>
        <div className="absolute top-40 left-20 w-24 h-24 border-2 border-slate-400 transform rotate-45"></div>
        <div className="absolute bottom-32 right-32 w-28 h-28 border-2 border-slate-400 rounded-lg"></div>
        <div className="absolute bottom-20 left-10 w-20 h-20 border-2 border-slate-400 rounded-full"></div>
        <div className="absolute top-1/2 left-1/4 w-16 h-16 border-2 border-slate-400 transform -rotate-45"></div>
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 max-w-md w-full">
        {/* Character - King Lemur */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative mb-6"
        >
          <div className="relative w-48 h-64 flex items-center justify-center">
            <Image
              src="/assets/lemur/king-lemur.png"
              alt="King Lemur"
              width={192}
              height={256}
              className="object-contain drop-shadow-lg"
              onError={(e) => {
                // Fallback if image doesn't exist yet - show placeholder
                (e.target as HTMLImageElement).style.display = 'none';
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) {
                  parent.innerHTML = `
                    <div class="w-48 h-64 bg-gradient-to-b from-slate-300 to-slate-400 rounded-full flex items-center justify-center border-4 border-slate-500">
                      <div class="text-6xl">👑</div>
                    </div>
                  `;
                }
              }}
            />
          </div>
        </motion.div>

        {/* Speech Bubble */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
          className="relative mb-8 w-full max-w-sm"
        >
          {/* Speech Bubble Container */}
          <div className="bg-white rounded-3xl p-6 shadow-2xl border-4 border-slate-800 relative">
            {/* Speech Bubble Tail (pointing to character) */}
            <div
              className="absolute bottom-0 right-1/4 transform translate-y-full"
              style={{
                width: 0,
                height: 0,
                borderLeft: '20px solid transparent',
                borderRight: '20px solid transparent',
                borderTop: '30px solid #1e293b',
              }}
            />
            <div
              className="absolute bottom-0 right-1/4 transform translate-y-full -mt-0.5"
              style={{
                width: 0,
                height: 0,
                borderLeft: '18px solid transparent',
                borderRight: '18px solid transparent',
                borderTop: '28px solid white',
              }}
            />

            {/* Speech Bubble Content */}
            <div className="relative z-10 space-y-3 text-right">
              {/* Greeting */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-2xl font-black text-slate-900 font-simpler"
              >
                היי {userName}!
              </motion.p>

              {/* Personalization Hook */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-base font-semibold text-slate-700 font-simpler leading-relaxed"
              >
                אז אתה בקטע של <span className="font-bold text-slate-900">{workoutType}</span> ורוצה{' '}
                <span className="font-bold text-slate-900">{goal}</span>? מגניב.
              </motion.p>

              {/* Action & Encouragement */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.0 }}
                className="text-base font-medium text-slate-600 font-simpler leading-relaxed mt-4"
              >
                אני מחשב לך את הפרופיל הסופי... אני כאן כדי לוודא שתתמיד! בוא נתחיל.
              </motion.p>
            </div>
          </div>
        </motion.div>

        {/* Loading Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex flex-col items-center space-y-3"
        >
          {/* Loading Spinner */}
          <div className="relative w-12 h-12">
            <motion.div
              className="absolute inset-0 border-4 border-slate-300 rounded-full"
              animate={{ rotate: 360 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
            <motion.div
              className="absolute inset-0 border-4 border-transparent border-t-slate-600 rounded-full"
              animate={{ rotate: 360 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          </div>

          {/* Loading Text */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="text-sm font-medium text-slate-600 font-simpler"
          >
            מעבד נתונים...
          </motion.p>
        </motion.div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-200/30 to-transparent pointer-events-none" />
    </div>
  );
}
