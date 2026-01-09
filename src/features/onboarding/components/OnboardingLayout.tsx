"use client";

import React from 'react';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';

interface OnboardingLayoutProps {
  children: React.ReactNode;
  currentStep: number;
  totalSteps: number;
  onContinue: () => void;
  onBack?: () => void;
  canContinue: boolean;
  continueLabelKey?: DictionaryKey;
  showBack?: boolean;
  hideContinueButton?: boolean;
}

export default function OnboardingLayout({
  children,
  currentStep,
  totalSteps,
  onContinue,
  onBack,
  canContinue,
  continueLabelKey = 'onboarding.continue',
  showBack = false,
  hideContinueButton = false,
}: OnboardingLayoutProps) {
  const { language } = useAppStore();
  const continueLabel = getTranslation(continueLabelKey, language);
  const backLabel = getTranslation('onboarding.back', language);

  // הגנה מפני division by zero
  const progressPercentage = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <div className="relative h-[100dvh] w-full bg-[#F3F4F6] overflow-hidden flex flex-col">
      {/* Progress Bar עליון */}
      <div className="w-full h-1 bg-gray-200 relative z-10">
        <div
          className="h-full bg-[#00E5FF] transition-all duration-300 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* לוגו OUT */}
      <div className="w-full flex justify-center py-4">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] bg-clip-text text-transparent">
          OUT
        </h1>
      </div>

      {/* תוכן מרכזי */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-6">
        <div className="max-w-md mx-auto w-full">
          {children}
        </div>
      </div>

      {/* כפתורים תחתונים - דביקים */}
      {!hideContinueButton && (
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-[#F3F4F6] via-[#F3F4F6] to-transparent pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] px-4 z-20">
          <div className="max-w-md mx-auto w-full flex gap-3">
            {/* כפתור חזרה */}
            {showBack && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-6 py-4 rounded-2xl bg-white border-2 border-gray-200 text-gray-700 font-semibold active:scale-95 transition-transform"
              >
                {backLabel}
              </button>
            )}

            {/* כפתור המשך */}
            <button
              type="button"
              onClick={onContinue}
              disabled={!canContinue}
              className={`
                flex-1 py-4 rounded-2xl font-bold text-lg
                transition-all duration-200
                active:scale-95
                ${canContinue
                  ? 'bg-[#00C9F2] hover:bg-[#00B4D8] text-white shadow-lg shadow-[#00C9F2]/30'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              {continueLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
