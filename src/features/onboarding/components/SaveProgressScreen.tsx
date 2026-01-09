"use client";

import React from 'react';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';

interface SaveProgressScreenProps {
  titleKey: DictionaryKey;
  subtitleKey?: DictionaryKey;
  onContinue: () => void;
}

export default function SaveProgressScreen({
  titleKey,
  subtitleKey,
  onContinue,
}: SaveProgressScreenProps) {
  const { language } = useAppStore();
  const title = getTranslation(titleKey, language);
  const subtitle = subtitleKey ? getTranslation(subtitleKey, language) : null;
  const continueLabel = getTranslation('onboarding.saveProgress.continue', language);

  return (
    <div className="w-full space-y-6 text-center">
      {/* אייקון או תמונה */}
      <div className="w-24 h-24 mx-auto bg-[#00E5FF]/10 rounded-full flex items-center justify-center">
        <svg
          className="w-12 h-12 text-[#00E5FF]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      {/* כותרת */}
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>

      {/* תיאור */}
      {subtitle && (
        <p className="text-base text-gray-600 leading-relaxed px-4">
          {subtitle}
        </p>
      )}

      {/* כפתור המשך */}
      <button
        onClick={onContinue}
        className="w-full py-4 rounded-2xl bg-[#00E5FF] text-white font-bold text-lg shadow-lg shadow-[#00E5FF]/30 active:scale-95 transition-transform mt-8"
      >
        {continueLabel}
      </button>
    </div>
  );
}
