"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';
import { OnboardingAnswers } from '../types';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { getAllGearDefinitions } from '@/features/content/equipment/gear';
import { GearDefinition } from '@/features/content/equipment/gear';
import { syncOnboardingToFirestore } from '../services/onboarding-sync.service';

interface SummaryRevealProps {
  titleKey: DictionaryKey;
  subtitleKey?: DictionaryKey;
  answers: OnboardingAnswers;
  onContinue: () => void;
}

export default function SummaryReveal({
  titleKey,
  subtitleKey,
  answers,
  onContinue,
}: SummaryRevealProps) {
  const router = useRouter();
  const { language } = useAppStore();
  const { data: onboardingData } = useOnboardingStore();
  const [progress, setProgress] = useState(0);
  const [equipment, setEquipment] = useState<GearDefinition[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(true);

  const title = getTranslation(titleKey, language);
  const subtitle = subtitleKey ? getTranslation(subtitleKey, language) : null;

  // חישוב הרמה לפי fitness_level
  const fitnessLevel = answers.fitness_level || 1;
  const currentLevel = fitnessLevel === 1 ? 1 : fitnessLevel === 2 ? 3 : 5;
  const maxLevel = 10;

  // ימי אימון
  const trainingDays = answers.schedule_days || [];
  const frequency = answers.schedule_frequency || 0;

  // Equipment IDs from onboarding data
  const equipmentIds = onboardingData?.equipmentList || answers.equipmentList || [];
  const hasGym = onboardingData?.hasGym || answers.hasGym || false;

  // Fetch equipment data on mount
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        const allGear = await getAllGearDefinitions();
        // Filter to only selected equipment
        const selectedGear = allGear.filter((gear) => equipmentIds.includes(gear.id));
        setEquipment(selectedGear);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      } finally {
        setLoadingEquipment(false);
      }
    };

    if (equipmentIds.length > 0) {
      fetchEquipment();
    } else {
      setLoadingEquipment(false);
    }
  }, [equipmentIds]);

  // Animate progress bar on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgress(65); // Animate to 65%
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  // Get equipment name helper
  const getEquipmentName = (gear: GearDefinition): string => {
    if (language === 'he') {
      return gear.name?.he || gear.name?.en || '';
    } else if (language === 'en') {
      return gear.name?.en || gear.name?.he || '';
    }
    return gear.name?.en || gear.name?.he || '';
  };

  // Handle continue - just call onContinue prop (parent handles sync and redirect)
  const handleContinue = () => {
    // Let the parent component (OnboardingWizard) handle sync and redirect
    onContinue();
  };

  return (
    <div className="w-full space-y-6" style={{ animation: 'fadeInUp 0.5s ease-out' }} dir="rtl">
      {/* כותרת */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        {subtitle && (
          <p className="text-lg text-slate-600">{subtitle}</p>
        )}
      </div>

      {/* ימי האימון */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">
          {getTranslation('onboarding.summary.trainingDays', language)}
        </h2>
        <div className="flex gap-2 justify-center flex-wrap">
          {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((day) => {
            const isSelected = trainingDays.includes(day);
            return (
              <div
                key={day}
                className={`
                  w-12 h-12 rounded-2xl flex items-center justify-center
                  font-bold text-lg transition-colors
                  ${isSelected
                    ? 'bg-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/30'
                    : 'bg-slate-200 text-slate-500'
                  }
                `}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lemur Character with Speech Bubble - Above "My Level" */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center space-y-4"
      >
        {/* Speech Bubble */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="relative w-full max-w-sm"
        >
          <div className="bg-white rounded-3xl p-6 shadow-xl border-4 border-slate-900 relative">
            {/* Speech Bubble Tail (pointing DOWN to Lemur, positioned on LEFT) */}
            <div
              className="absolute bottom-0 left-10 transform translate-y-full"
              style={{
                width: 0,
                height: 0,
                borderLeft: '20px solid transparent',
                borderRight: '20px solid transparent',
                borderTop: '28px solid #0f172a',
              }}
            />
            <div
              className="absolute bottom-0 left-10 transform translate-y-full -mt-1"
              style={{
                width: 0,
                height: 0,
                borderLeft: '16px solid transparent',
                borderRight: '16px solid transparent',
                borderTop: '24px solid white',
              }}
            />

            {/* Speech Bubble Content */}
            <p className="text-base font-bold text-slate-900 text-center font-simpler relative z-10">
              {language === 'he' 
                ? 'התקדמות מעולה! רוב המשתמשים מגיעים לרמה הבאה תוך 6 שבועות.'
                : 'Great progress! Most users reach the next level in 6 weeks.'
              }
            </p>
          </div>
        </motion.div>

        {/* Lemur Character */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative w-48 h-56 flex items-center justify-center"
        >
          <Image
            src="/assets/lemur/smart-lemur.png"
            alt="Smart Lemur"
            width={192}
            height={224}
            className="object-contain drop-shadow-2xl"
            style={{
              filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))',
            }}
            priority
          />
        </motion.div>
      </motion.div>

      {/* הרמה שלי */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">
          {getTranslation('onboarding.summary.myLevel', language)}
        </h2>
        <div className="text-2xl font-bold text-[#00E5FF]">
          רמה {currentLevel}/{maxLevel}
        </div>
      </div>

      {/* הציוד שלי - My Equipment */}
      {(equipment.length > 0 || hasGym) && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">
            הציוד שלי
          </h2>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            {loadingEquipment ? (
              <p className="text-sm text-slate-500">טוען ציוד...</p>
            ) : (
              <div className="space-y-2">
                {/* Selected Equipment */}
                {equipment.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {equipment.map((gear) => (
                      <div
                        key={gear.id}
                        className="px-4 py-2 rounded-xl bg-[#00E5FF]/10 border border-[#00E5FF]/30 text-sm font-medium text-[#00E5FF]"
                      >
                        {getEquipmentName(gear)}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Gym Access */}
                {hasGym && (
                  <div className="px-4 py-2 rounded-xl bg-cyan-100/50 border border-cyan-300/50 text-sm font-medium text-cyan-700">
                    חדר כושר
                  </div>
                )}

                {/* No Equipment Message */}
                {equipment.length === 0 && !hasGym && (
                  <p className="text-sm text-slate-500">לא נבחר ציוד</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* מתאמנים מתמידים - Persistent Trainees */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          {getTranslation('onboarding.summary.persistentTrainees', language)}
        </h3>
        <div className="relative w-full h-3 bg-slate-200 rounded-full mb-2 overflow-hidden">
          <motion.div
            className="absolute top-0 start-0 h-full bg-[#00E5FF] rounded-full shadow-lg shadow-[#00E5FF]/30"
            initial={{ width: '0%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
          />
        </div>
        <p className="text-sm text-slate-600">
          {getTranslation('onboarding.summary.persistentTrainees.description', language)}
        </p>
      </div>

      {/* האתגר שלי */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">
          {getTranslation('onboarding.summary.myChallenge', language)}
        </h2>
        <p className="text-sm text-slate-600">
          {getTranslation('onboarding.summary.myChallenge.instruction', language)}
        </p>
        {/* TODO: הוספת כרטיס אתגר עם תמונה */}
      </div>

      {/* כפתור המשך */}
      <button
        onClick={handleContinue}
        className="w-full py-4 rounded-2xl bg-[#00E5FF] text-white font-bold text-lg shadow-lg shadow-[#00E5FF]/30 active:scale-95 transition-transform hover:bg-cyan-400"
      >
        {getTranslation('onboarding.summary.startButton', language)}
      </button>
    </div>
  );
}
