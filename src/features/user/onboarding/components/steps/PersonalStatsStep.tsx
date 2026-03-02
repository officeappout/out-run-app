'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Weight } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import WheelPicker from '@/components/ui/WheelPicker';
import StickyActionButton from '@/components/ui/StickyActionButton';

interface PersonalStatsStepProps {
  onNext: () => void;
  isJIT?: boolean;
  isLastStep?: boolean;
}

export default function PersonalStatsStep({ onNext, isJIT, isLastStep }: PersonalStatsStepProps) {
  const { updateData, data } = useOnboardingStore();

  const [weight, setWeight] = useState<number>((data as any).weight || 70);

  const savedLanguage: OnboardingLanguage = (typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_language') || 'he')
    : 'he') as OnboardingLanguage;
  const isHebrew = savedLanguage === 'he';
  const direction = isHebrew ? 'rtl' : 'ltr';

  const handleWeightChange = (newWeight: number) => {
    setWeight(newWeight);
    updateData({ weight: newWeight } as any);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding_weight', String(newWeight));
    }
  };

  const buttonLabel = isJIT
    ? (isHebrew ? 'שמירת שינויים' : 'Save Changes')
    : isLastStep
      ? (isHebrew ? 'בואו נתחיל!' : "Let's Go!")
      : (isHebrew ? 'המשך' : 'Continue');

  const successLabel = isJIT
    ? (isHebrew ? 'הפרופיל עודכן!' : 'Profile Updated!')
    : undefined;

  return (
    <div className="flex flex-col h-full" dir={direction}>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1">
        <motion.div
          key="weight"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full flex flex-col"
        >
          <div className="text-center pt-4 mb-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className="w-14 h-14 bg-gradient-to-br from-[#5BC2F2]/20 to-[#5BC2F2]/5 rounded-2xl flex items-center justify-center mx-auto mb-3"
            >
              <Weight size={28} className="text-[#5BC2F2]" />
            </motion.div>
            <h2 className="text-xl font-bold text-slate-900">
              {isHebrew ? 'מה המשקל שלך?' : 'What is your weight?'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {isHebrew
                ? 'נשתמש בזה כדי לחשב את צריכת הקלוריות ולהתאים תוכנית אישית'
                : "We'll use this to calculate your calorie burn and personalize your plan"}
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center py-4">
            <WheelPicker
              value={weight}
              onChange={handleWeightChange}
              min={40}
              max={150}
              step={1}
              unit="ק״ג"
            />
          </div>
        </motion.div>
      </div>

      <StickyActionButton
        label={buttonLabel}
        successLabel={successLabel}
        disabled={weight <= 0}
        onPress={onNext}
      />
    </div>
  );
}
