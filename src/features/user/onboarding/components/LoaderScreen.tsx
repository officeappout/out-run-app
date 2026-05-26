"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

interface LoaderScreenProps {
  onComplete: () => void;
  // אנחנו לא צריכים titleKey כי הטקסטים של השלבים נמצאים בפנים
}

// רשימת השלבים שתרוץ אחד אחרי השני
const LOADING_STEPS = [
  { id: 1, text: 'שומר את הצהרת הבריאות והחתימה...' },
  { id: 2, text: 'מנתח את הציוד הזמין לך...' },
  { id: 3, text: 'מחשב עומסים מותאמים אישית...' },
  { id: 4, text: 'מכין את תוכנית האימונים שלך...' },
];

export default function LoaderScreen({ onComplete }: LoaderScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // אם עוד לא סיימנו את כל השלבים
    if (currentStep < LOADING_STEPS.length) {
      // חכה שניה וחצי בין שלב לשלב
      const timeout = setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
      }, 2500);
      return () => clearTimeout(timeout);
    } else {
      // סיימנו הכל! נחכה רגע קטן ואז נעבור מסך
      const timeout = setTimeout(() => {
        onComplete();
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [currentStep, onComplete]);

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6" dir="rtl">

      {/* --- Official logo with breathing pulse --- */}
      <div className="mb-12 relative flex items-center justify-center">
        <div
          className="absolute inset-0 -m-6 rounded-full blur-2xl animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(0,229,255,0.28) 0%, transparent 70%)',
            animationDuration: '2s',
          }}
        />
        <img
          src="/assets/logo/Kind=logotype.svg"
          alt="OUT"
          className="relative h-14 brightness-0 opacity-80 animate-pulse"
          style={{ animationDuration: '2s' }}
        />
      </div>

      {/* --- רשימת המשימות --- */}
      <div className="w-full max-w-xs space-y-5">
        {LOADING_STEPS.map((step, index) => {
          // חישוב סטטוס של כל שורה
          const isCompleted = index < currentStep; // האם השלב עבר?
          const isCurrent = index === currentStep;   // האם אנחנו עובדים עליו עכשיו?
          const isPending = index > currentStep;     // האם זה שלב עתידי?

          return (
            <div
              key={step.id}
              className={`flex items-center gap-4 transition-all duration-500 ease-out
                ${isPending ? 'opacity-40 translate-y-2' : 'opacity-100 translate-y-0'}
              `}
            >
              {/* האייקון בצד ימין */}
              <div className="shrink-0 transition-all duration-300">
                {isCompleted ? (
                  // וי ירוק
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-sm shadow-green-200 scale-110">
                    <Check size={14} className="text-white" strokeWidth={3} />
                  </div>
                ) : isCurrent ? (
                  // ספינר כחול קטן
                  <Loader2 size={24} className="text-[#4FB4F7] animate-spin" />
                ) : (
                  // עיגול אפור (ממתין)
                  <div className="w-6 h-6 border-2 border-gray-100 rounded-full bg-gray-50" />
                )}
              </div>

              {/* טקסט השלב */}
              <span className={`text-sm font-medium transition-colors duration-300
                ${isCompleted ? 'text-gray-900' : isCurrent ? 'text-[#4FB4F7]' : 'text-gray-400'}
              `}>
                {step.text}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-16 text-center opacity-60">
        <p className="text-xs text-gray-400 animate-pulse">בונה את חווית ה-OUT שלך...</p>
      </div>

    </div>
  );
}