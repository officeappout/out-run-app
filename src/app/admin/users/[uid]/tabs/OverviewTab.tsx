'use client';

import React from 'react';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { formatLastActivity, PRIMARY_GOAL_LABELS } from '../../shared.utils';
import AccountChips from '../sections/AccountChips';
import type { UserTabData } from './types';

type Props = Pick<UserTabData, 'user' | 'fullProfile' | 'workoutHistory'>;

/** סקירה: KPIs, churn-risk reasons, goals summary, account chips. */
export default function OverviewTab({ user, fullProfile, workoutHistory }: Props) {
  const weeklyWorkouts = workoutHistory.filter((w) => Date.now() - w.date.getTime() <= 7 * 86_400_000).length;
  const onboardingAnswers = (fullProfile as { onboardingAnswers?: { primaryGoal?: string; primaryGoalLabel?: string } }).onboardingAnswers;
  const primaryGoal = onboardingAnswers?.primaryGoalLabel
    || (onboardingAnswers?.primaryGoal ? (PRIMARY_GOAL_LABELS[onboardingAnswers.primaryGoal] || onboardingAnswers.primaryGoal) : undefined);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
          <div className="text-[11px] text-blue-600 font-bold mb-0.5">רמה כללית</div>
          <div className="text-xl font-black text-blue-800">{(user as any).effectiveLevel ?? user.level}</div>
        </div>
        <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 text-center">
          <div className="text-[11px] text-cyan-700 font-bold mb-0.5">{"סה\"כ אימונים"}</div>
          <div className="text-xl font-black text-cyan-800">{(user as any).workoutCount ?? 0}</div>
        </div>
        <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-center">
          <div className="text-[11px] text-teal-700 font-bold mb-0.5">אימונים השבוע</div>
          <div className="text-xl font-black text-teal-800">{weeklyWorkouts}</div>
        </div>
      </div>

      <div>
        {(() => {
          const recency = formatLastActivity(user?.lastWorkoutDate);
          const streak = (fullProfile?.progression as any)?.currentStreak ?? 0;
          const hasWorkouts = (user?.workoutCount ?? 0) > 0;
          const daysSinceSignup = user?.joinDate
            ? Math.floor((Date.now() - user.joinDate.getTime()) / 86_400_000)
            : null;
          const reasons: string[] = [];
          if (streak === 0 && hasWorkouts) {
            reasons.push('רצף 0 — עוד לא חזר/ה לאימון שני ברציפות');
          }
          if (user && !user.pushEnabled) {
            reasons.push('התראות Push כבויות');
          }
          if (daysSinceSignup !== null && daysSinceSignup <= 7) {
            reasons.push(`משתמש/ת חדש/ה (${daysSinceSignup} ימים מההרשמה)`);
          }
          if (recency.dotColor === 'bg-red-500' || recency.dotColor === 'bg-gray-300') {
            reasons.push(`${recency.label}`);
          }
          return (
            <>
              <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                <AlertCircle size={20} className="text-red-500" />
                למה סיכון הנטישה גבוה
              </h3>
              {reasons.length === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 font-bold">
                  אין סימני סיכון משמעותיים כרגע
                </div>
              ) : (
                <ul className="space-y-2">
                  {reasons.map((r, i) => (
                    <li key={i} className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </>
          );
        })()}
      </div>

      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-cyan-600" />
          סיכום יעדים
        </h3>
        <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4 mb-3">
          <p className="text-xs text-cyan-700 mb-1">יעד ראשי</p>
          <p className="font-bold text-gray-900">{primaryGoal ?? 'טרם סופק'}</p>
        </div>
        <h3 className="text-lg font-black text-gray-900 mb-4">יעדים אדפטיביים</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">יעד צעדים יומי</p>
            <p className="font-bold text-gray-900">
              {(fullProfile.progression as any)?.stepGoalMode === 'manual'
                ? `${(fullProfile.progression as any)?.dailyStepGoal} (ידני)`
                : (fullProfile.progression as any)?.stepGoalComputedOn
                  ? `${(fullProfile.progression as any)?.dailyStepGoal} (אוטומטי)`
                  : 'אוטומטי — טרם חושב (8000)'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">יעד קומות יומי</p>
            <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.dailyFloorGoal ?? 'לא הוגדר'}</p>
          </div>
        </div>
      </div>

      <AccountChips user={user} fullProfile={fullProfile} />
    </div>
  );
}
