"use client";

import React from 'react';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';
import { OnboardingAnswers } from '../types';

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
  const { language } = useAppStore();
  const title = getTranslation(titleKey, language);
  const subtitle = subtitleKey ? getTranslation(subtitleKey, language) : null;

  // חישוב הרמה לפי fitness_level
  const fitnessLevel = answers.fitness_level || 1;
  const currentLevel = fitnessLevel === 1 ? 1 : fitnessLevel === 2 ? 3 : 5;
  const maxLevel = 10; // לדוגמה

  // ימי אימון
  const trainingDays = answers.schedule_days || [];
  const frequency = answers.schedule_frequency || 0;

  return (
    <div className="w-full space-y-6" style={{ animation: 'fadeInUp 0.5s ease-out' }}>
      {/* כותרת */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="text-lg text-gray-600">{subtitle}</p>
        )}
      </div>

      {/* ימי האימון */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">
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
                  font-bold text-lg
                  ${isSelected
                    ? 'bg-[#00E5FF] text-white'
                    : 'bg-gray-200 text-gray-500'
                  }
                `}
              >
                {day}
              </div>
            );
          })}
        </div>
      </div>

      {/* הרמה שלי */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">
          {getTranslation('onboarding.summary.myLevel', language)}
        </h2>
        <div className="text-2xl font-bold text-[#00E5FF]">
          רמה {currentLevel}/{maxLevel}
        </div>
      </div>

      {/* מתאמנים מתמידים */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {getTranslation('onboarding.summary.persistentTrainees', language)}
        </h3>
        <div className="relative w-full h-2 bg-gray-200 rounded-full mb-2">
          <div
            className="absolute top-0 start-0 h-full bg-[#00E5FF] rounded-full transition-all duration-500"
            style={{ width: '0%' }}
          />
        </div>
        <p className="text-sm text-gray-600">
          {getTranslation('onboarding.summary.persistentTrainees.description', language)}
        </p>
      </div>

      {/* האתגר שלי */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">
          {getTranslation('onboarding.summary.myChallenge', language)}
        </h2>
        <p className="text-sm text-gray-600">
          {getTranslation('onboarding.summary.myChallenge.instruction', language)}
        </p>
        {/* TODO: הוספת כרטיס אתגר עם תמונה */}
      </div>

      {/* כפתור המשך */}
      <button
        onClick={onContinue}
        className="w-full py-4 rounded-2xl bg-[#00E5FF] text-white font-bold text-lg shadow-lg shadow-[#00E5FF]/30 active:scale-95 transition-transform"
      >
        {getTranslation('onboarding.summary.startButton', language)}
      </button>
    </div>
  );
}
