'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import type { InitialCardProps } from '../location-types';

export function InitialCard({ gender, t, locationError, onFindLocation, onSearchManually, mode = 'onboarding', detectedNeighborhood, detectedCity, purpose }: InitialCardProps) {
  const isExplorer = mode === 'explorer';
  const isRunning = purpose === 'running';
  const userName = typeof window !== 'undefined' 
    ? sessionStorage.getItem('onboarding_personal_name') || ''
    : '';
  const isFemale = gender === 'female';

  const locationAnchor = detectedNeighborhood || detectedCity || null;

  const headline = isRunning
    ? <>{isFemale ? 'בואי' : 'בוא'} נאשר מיקום כדי שנטען את אימון הריצה שלך</>
    : isExplorer
      ? (locationAnchor
          ? <>הגינה הכי קרובה ל{locationAnchor}</>
          : <>להכיר את השכונה, מקרוב</>)
      : <>להכיר את השכונה, מקרוב</>;

  const subtitle = isRunning
    ? <>נמצא לך מסלול ריצה וגם גינות כושר בדרך</>
    : <>כדי שנוכל להציג את מסלולי ההליכה, גינות הכושר והמקומות הכי בטוחים וקרובים אליכם, יש לאשר גישה למיקום.</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.3 }}
      className="absolute bottom-0 left-0 right-0 z-20"
      dir="rtl"
    >
      <div className="bg-gradient-to-t from-white via-white/98 to-transparent pt-12 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(91,194,242,0.10)] p-6 pb-8 border-t border-slate-100/40">
          <h2 
            className="text-2xl font-bold leading-tight text-slate-900 mb-3"
            style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right' }}
          >
            {headline}
          </h2>
          <p 
            className="text-slate-600 leading-relaxed text-sm mb-4"
            style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right' }}
          >
            {subtitle}
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
            <span>מציאת מיקום אוטומטית (GPS)</span>
          </button>

          <button
            onClick={onSearchManually}
            className="w-full mt-4 text-[#5BC2F2] hover:text-[#4AADE3] text-sm py-2 transition-colors underline underline-offset-2 font-medium"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            בחירת עיר ושכונה באופן ידני
          </button>
        </div>
      </div>
    </motion.div>
  );
}
