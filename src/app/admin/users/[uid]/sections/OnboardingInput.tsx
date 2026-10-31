'use client';

import React from 'react';
import { PERSONA_LABELS } from '../../shared.utils';
import type { UserTabData } from '../tabs/types';

/** Initial assessment, lifestyle and persona, chosen goals, commute. */
export default function OnboardingInput({ fullProfile }: Pick<UserTabData, 'fullProfile'>) {
  return (
    <>
      {/* Core Assessment */}
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4">הערכה ראשונית</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-xs text-blue-600 font-medium">Fitness Tier</p>
            <p className="text-2xl font-black text-blue-700">{fullProfile.core?.initialFitnessTier ?? '?'}</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 text-center">
            <p className="text-xs text-purple-600 font-medium">Tracking Mode</p>
            <p className="text-lg font-black text-purple-700">{fullProfile.core?.trackingMode ?? '?'}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-xs text-green-600 font-medium">יעד עיקרי</p>
            <p className="text-lg font-black text-green-700">{fullProfile.core?.mainGoal ?? '?'}</p>
          </div>
        </div>
      </div>
      {/* Lifestyle & Persona */}
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4">אורח חיים ופרסונה</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Dashboard Mode</p>
            <p className="font-bold text-gray-900">{fullProfile.lifestyle?.dashboardMode || 'ברירת מחדל'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">כלב</p>
            <p className="font-bold text-gray-900">{fullProfile.lifestyle?.hasDog ? 'כן' : 'לא'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">פרסונות</p>
            <p className="font-bold text-gray-900">
              {(fullProfile as any)?.personas?.length
                ? (fullProfile as any).personas.map((p: any) => PERSONA_LABELS[p.id] || p.id).join(', ')
                : 'אין'}
            </p>
          </div>
        </div>
        {fullProfile.lifestyle?.lifestyleTags && fullProfile.lifestyle.lifestyleTags.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2">Lifestyle Tags</p>
            <div className="flex flex-wrap gap-2">
              {fullProfile.lifestyle.lifestyleTags.map((tag, i) => (
                <span key={i} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Goals */}
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4">יעדים שנבחרו</h3>
        {(() => {
          const goals = (fullProfile as any)?.selectedGoals || (fullProfile as any)?.onboardingAnswers?.allGoals || [];
          const primary = (fullProfile as any)?.onboardingAnswers?.primaryGoal;
          return (
            <div>
              {primary && (
                <div className="mb-2 inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-bold">
                  יעד ראשי: {(fullProfile as any)?.onboardingAnswers?.primaryGoalLabel || primary}
                </div>
              )}
              {goals.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {goals.map((g: string, i: number) => (
                    <span key={i} className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-bold">
                      {g}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">אין יעדים רשומים</p>
              )}
            </div>
          );
        })()}
      </div>
      {/* Commute */}
      {fullProfile.lifestyle?.commute && (
        <div>
          <h3 className="text-lg font-black text-gray-900 mb-4">נסיעות</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">אמצעי תחבורה</p>
              <p className="font-bold text-gray-900">{fullProfile.lifestyle.commute.method || '?'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">אתגרי נסיעה</p>
              <p className="font-bold text-gray-900">{fullProfile.lifestyle.commute.enableChallenges ? 'מופעל' : 'כבוי'}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
