'use client';

import React from 'react';
import { Activity, Clock } from 'lucide-react';
import type { UserTabData } from '../tabs/types';

/** Starting state, workout preferences and schedule days from onboarding. */
export default function TrainingProfile({ fullProfile }: Pick<UserTabData, 'fullProfile'>) {
  // Helper to get historyFrequency label
  const getHistoryFrequencyLabel = (frequency?: string): string => {
    if (!frequency) return 'טרם סופק';
    const labels: Record<string, string> = {
      'none': 'לא התאמן בכלל',
      '1-2': 'אימונים 1-2 פעמים בשבוע',
      '3+': 'אימונים אינטנסיביים (3+ פעמים בשבוע)',
    };
    return labels[frequency] || frequency;
  };

  // Helper to get workout preference labels
  const getWorkoutPreferenceLabels = (historyTypes?: string[]): string[] => {
    if (!historyTypes || historyTypes.length === 0) return ['טרם סופק'];
    const labels: Record<string, string> = {
      'gym': 'חדר כושר',
      'street': 'פארקים ציבוריים',
      'studio': 'סטודיו / שיעורים',
      'home': 'אימון ביתי',
      'cardio': 'ריצה / אירובי בחוץ',
    };
    return historyTypes.map(type => labels[type] || type);
  };

  // Helper to get historyFrequency from user data
  const getHistoryFrequency = (): string | undefined => {
    return (fullProfile as any)?.historyFrequency || 
           (fullProfile as any)?.onboarding?.historyFrequency ||
           (fullProfile as any)?.onboarding?.pastActivityLevel;
  };

  // Helper to get historyTypes from user data
  const getHistoryTypes = (): string[] | undefined => {
    return (fullProfile as any)?.historyTypes || 
           (fullProfile as any)?.onboarding?.historyTypes;
  };

  return (
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
        <Activity size={20} className="text-amber-500" />
        פרופיל אימונים (נתוני השפעה)
        </h3>
      <div className="space-y-4">
        {/* Initial State - Critical for Impact Reports */}
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5">
          <div className="text-sm font-bold text-amber-900 mb-2">📍 מצב התחלתי</div>
          <div className="text-base font-bold text-gray-900">
            {getHistoryFrequencyLabel(getHistoryFrequency())}
          </div>
          <div className="text-xs text-amber-700 mt-2">
            תשובה לשאלה: "איך נראת שגרת האימונים שלך בחודש שעבר?"
          </div>
        </div>

        {/* Workout Preferences */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-600 mb-2">העדפות אימון</div>
          <div className="flex flex-wrap gap-2">
            {getWorkoutPreferenceLabels(getHistoryTypes()).map((pref, idx) => (
              <span
                key={idx}
                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-full text-sm font-medium"
              >
                {pref}
              </span>
            ))}
            </div>
          </div>


        {/* Schedule Days */}
        {fullProfile.lifestyle?.scheduleDays && fullProfile.lifestyle.scheduleDays.length > 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-600 mb-3">ימי אימון</div>
              <div className="flex flex-wrap gap-2">
                {fullProfile.lifestyle.scheduleDays.map((day, idx) => (
                  <span
                    key={idx}
                    className="w-10 h-10 rounded-2xl bg-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/30 flex items-center justify-center font-bold text-lg"
                  >
                    {day}
                  </span>
                ))}
              </div>
              {fullProfile.lifestyle.trainingTime && (
              <div className="mt-3 flex items-center gap-1 text-xs text-gray-600">
                  <Clock size={12} />
                  שעה מועדפת: {fullProfile.lifestyle.trainingTime}
                </div>
              )}
            </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-600 mb-1">ימי אימון</div>
            <div className="text-sm text-gray-500 italic">טרם סופק</div>
          </div>
        )}
      </div>
    </div>
  );
}
