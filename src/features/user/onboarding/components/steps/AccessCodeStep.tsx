'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { validateAccessCode, type AccessCodeResult } from '../../services/access-code.service';
import { useOnboardingStore } from '../../store/useOnboardingStore';

interface AccessCodeStepProps {
  onNext: () => void;
}

export default function AccessCodeStep({ onNext }: AccessCodeStepProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { updateData } = useOnboardingStore();

  const handleSubmit = async () => {
    if (!code.trim()) {
      setError('יש להזין קוד גישה');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result: AccessCodeResult = await validateAccessCode(code);

      updateData({
        tenantId: result.tenantId,
        unitId: result.unitId,
        unitPath: result.unitPath,
        tenantType: result.tenantType,
      });

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('onboarding_path', result.onboardingPath);
      }

      onNext();
    } catch (err: any) {
      const msg = err?.message || err?.code || '';
      if (msg.includes('not-found') || msg.includes('not found')) {
        setError('קוד גישה לא נמצא. בדקו ונסו שוב.');
      } else if (msg.includes('expired')) {
        setError('קוד הגישה פג תוקף.');
      } else if (msg.includes('resource-exhausted') || msg.includes('maximum')) {
        setError('קוד הגישה הגיע למכסה המקסימלית.');
      } else if (msg.includes('precondition') || msg.includes('no longer active')) {
        setError('קוד הגישה אינו פעיל יותר.');
      } else {
        setError('שגיאה בבדיקת הקוד. נסו שוב.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      dir="rtl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center gap-6 px-6 py-10"
    >
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          קוד גישה
        </h2>
        <p className="text-gray-500 text-sm">
          הזינו את הקוד שקיבלתם מהארגון שלכם
        </p>
      </div>

      <div className="w-full max-w-xs">
        <input
          dir="ltr"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="UNIT-X79"
          className="w-full text-center text-2xl font-mono tracking-widest
                     border-2 border-gray-200 rounded-2xl px-4 py-4
                     focus:border-primary focus:outline-none
                     transition-colors placeholder:text-gray-300"
          autoFocus
          disabled={loading}
        />

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-red-500 text-sm text-center mt-3"
          >
            {error}
          </motion.p>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !code.trim()}
        className="w-full max-w-xs py-3.5 rounded-xl font-semibold text-white
                   bg-primary disabled:opacity-40 transition-opacity"
      >
        {loading ? 'בודק...' : 'אישור'}
      </button>

      <p className="text-xs text-gray-400 text-center max-w-xs">
        הקוד מאפשר גישה לתוכנית הכושר של הארגון שלכם.
        אין לכם קוד? פנו למפקד/מורה שלכם.
      </p>
    </motion.div>
  );
}
