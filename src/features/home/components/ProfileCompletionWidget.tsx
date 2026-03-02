'use client';

/**
 * ProfileCompletionWidget
 * 
 * Shows a progress ring with completion percentage and a CTA to complete
 * missing profile fields. Hidden when progress = 100%.
 */

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, CheckCircle2, Circle } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { calculateProfileCompletion } from '@/features/user/identity/services/profile-completion.service';

export default function ProfileCompletionWidget() {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);
  const [isExpanded, setIsExpanded] = useState(false);

  const completion = useMemo(
    () => calculateProfileCompletion(profile),
    [profile],
  );

  // Hide if fully complete
  if (completion.isVerified || completion.percentage >= 100) return null;

  const circumference = 2 * Math.PI * 28; // radius = 28
  const dashOffset = circumference - (completion.percentage / 100) * circumference;

  const handleGoToStep = (step: string) => {
    router.push(`/onboarding-new/setup?step=${step}&jit=true`);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-4 p-4 text-right"
        dir="rtl"
      >
        {/* Progress Ring */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r="28"
              strokeWidth="4"
              fill="none"
              className="stroke-gray-100"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              className="stroke-emerald-500 transition-all duration-700"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-gray-800">
              {completion.percentage}%
            </span>
          </div>
        </div>

        {/* Text */}
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 text-sm">השלם את הפרופיל שלך</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {completion.pending.length > 0
              ? `נותרו ${completion.pending.length} שלבים`
              : 'כל השלבים הושלמו!'}
          </p>
        </div>

        {/* Expand toggle */}
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Expanded list of items */}
      {isExpanded && (
        <div className="border-t border-gray-50 px-4 pb-4 space-y-2" dir="rtl">
          {completion.items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 py-2 ${
                item.completed ? 'opacity-60' : ''
              }`}
            >
              {item.completed ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-gray-300 flex-shrink-0" />
              )}

              <span
                className={`flex-1 text-sm ${
                  item.completed
                    ? 'text-gray-500 line-through'
                    : 'text-gray-800 font-medium'
                }`}
              >
                {item.label}
              </span>

              {!item.completed && item.step && (
                <button
                  onClick={() => handleGoToStep(item.step!)}
                  className="text-xs text-emerald-600 font-bold hover:underline"
                >
                  השלם
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
