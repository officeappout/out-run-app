'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Weight } from 'lucide-react';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { type OnboardingLanguage } from '@/lib/i18n/onboarding-locales';
import WheelPicker from '@/components/ui/WheelPicker';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { useOnboardingV2 } from '../../hooks/useOnboardingV2';

interface PersonalStatsStepProps {
  onNext: () => void;
  isJIT?: boolean;
  isLastStep?: boolean;
}

export default function PersonalStatsStep({ onNext, isJIT, isLastStep }: PersonalStatsStepProps) {
  const { updateData, data } = useOnboardingStore();
  const v2 = useOnboardingV2();

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

  // ── v2 (enable_home_v2) — same weight state / store write / CTA; v2 look ──
  if (v2) {
    return (
      <div className="flex h-full flex-col font-simpler text-v2-ink" dir={direction}>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1">
          <motion.div
            key="weight"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex h-full flex-col"
          >
            <div className="mb-4 pt-4 text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/25"
              >
                <Weight size={26} strokeWidth={2.2} />
              </motion.div>
              <h2 className="text-[22px] font-black leading-[1.2] !tracking-[-0.02em] text-v2-ink">
                {isHebrew ? 'מה המשקל שלך?' : 'What is your weight?'}
              </h2>
              <p className="mx-auto mt-1 max-w-[320px] text-[14px] font-medium leading-snug text-v2-ink-2">
                {isHebrew
                  ? 'נשתמש בזה כדי לחשב את צריכת הקלוריות ולהתאים תוכנית אישית'
                  : "We'll use this to calculate your calorie burn and personalize your plan"}
              </p>
            </div>

            <div className="flex flex-1 items-center justify-center py-4">
              <div className="rounded-v2-card bg-white px-6 pb-4 pt-5 shadow-v2-card">
                <WheelPicker
                  value={weight}
                  onChange={handleWeightChange}
                  min={40}
                  max={150}
                  step={1}
                  unit="ק״ג"
                />
              </div>
            </div>
          </motion.div>
        </div>

        <StickyActionButton
          label={buttonLabel}
          successLabel={successLabel}
          disabled={weight <= 0}
          onPress={onNext}
          variant="v2"
        />
      </div>
    );
  }

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
