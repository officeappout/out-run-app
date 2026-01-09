"use client";

import React from 'react';
import { TERMS_CONTENT } from '@/constants/terms-content';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';
import { useRouter } from 'next/navigation';

interface TermsOfUseProps {
  onApprove: () => void;
  onBack?: () => void;
  currentStep?: number;
  totalSteps?: number;
}

export default function TermsOfUse({ onApprove, onBack, currentStep = 0, totalSteps = 1 }: TermsOfUseProps) {
  const { language } = useAppStore();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  // הגנה מפני division by zero
  const progressPercentage = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <div className="h-full flex flex-col bg-[#F3F4F6]" dir="rtl">
      {/* Progress Bar עליון */}
      <div className="w-full h-1 bg-gray-200 flex-shrink-0">
        <div
          className="h-full bg-[#00E5FF] transition-all duration-300 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* לוגו OUT */}
      <div className="w-full flex justify-center py-4 flex-shrink-0 bg-[#F3F4F6]">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] bg-clip-text text-transparent">
          OUT
        </h1>
      </div>

      {/* Header - Fixed at Top */}
      <div className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={handleBack}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="חזרה"
          >
            <span className="material-icons-round text-gray-700">arrow_forward</span>
          </button>
          <h2 className="text-lg font-semibold text-gray-900">
            {getTranslation('onboarding.terms.title' as DictionaryKey, language) || 'תנאי שימוש'}
          </h2>
          <div className="w-10" /> {/* Spacer for symmetry */}
        </div>
      </div>

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {TERMS_CONTENT.map((section, index) => (
            <div key={index} className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900">{section.title}</h3>
              {section.paragraphs.map((paragraph, pIndex) => (
                <p key={pIndex} className="text-gray-700 leading-relaxed text-base">
                  {paragraph}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Footer - Fixed at Bottom */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-4">
        <button
          onClick={onApprove}
          className="w-full py-4 rounded-xl text-white font-semibold text-lg transition-all duration-200 active:scale-95"
          style={{ backgroundColor: '#4FB4F7' }}
        >
          {getTranslation('onboarding.health.approve' as DictionaryKey, language) || 'מאשר.ת'}
        </button>
      </div>
    </div>
  );
}
