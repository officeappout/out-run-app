'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import type { InitialCardProps } from '../location-types';

export function InitialCard({ gender, t, locationError, onFindLocation, onSearchManually }: InitialCardProps) {
  const userName = typeof window !== 'undefined' 
    ? sessionStorage.getItem('onboarding_personal_name') || ''
    : '';
  const isFemale = gender === 'female';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.3 }}
      className="absolute bottom-0 left-0 right-0 z-20"
      dir="rtl"
    >
      <div className="bg-gradient-to-t from-white via-white/98 to-transparent pt-12 pb-4">
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(91,194,242,0.10)] p-6 border-t border-slate-100/40">
          <h2 
            className="text-2xl font-bold leading-tight text-slate-900 mb-3"
            style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right' }}
          >
            {userName ? (
              <>היי {userName}, {isFemale ? 'בואי' : 'בוא'} נמצא את הגינה הכי קרובה {isFemale ? 'אלייך' : 'אליך'}</>
            ) : (
              <>בואו נמצא את הגינה הכי קרובה אליכם</>
            )}
          </h2>
          <p 
            className="text-slate-600 leading-relaxed text-sm mb-4"
            style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right' }}
          >
            מיפינו מאות גינות כושר ברחבי הארץ, עם מתקנים שמתאימים לאימוני OUT.
            {' '}
            {t('אשר את המיקום שלך ונמצא את הגינה הקרובה אליך.', 'אשרי את המיקום שלך ונמצא את הגינה הקרובה אלייך.')}
          </p>

          {locationError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-4"
            >
              <p className="text-sm text-red-600" style={{ fontFamily: 'var(--font-simpler)' }}>
                {locationError}
              </p>
            </motion.div>
          )}

          <button
            onClick={onFindLocation}
            className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-4 rounded-2xl shadow-xl shadow-[#5BC2F2]/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <MapPin size={20} />
            <span>מצאו את המיקום שלי</span>
          </button>

          <button
            onClick={onSearchManually}
            className="w-full mt-3 text-slate-500 hover:text-[#5BC2F2] text-sm py-2 transition-colors"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            או חפשו ידנית
          </button>
        </div>
      </div>
    </motion.div>
  );
}
