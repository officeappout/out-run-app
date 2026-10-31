'use client';

import React from 'react';
import { AlertCircle, Coins } from 'lucide-react';
import type { UserTabData } from '../tabs/types';

/** XP and Lemur, coin economy, gamification counters. */
export default function EconomySection({ user, fullProfile, workoutHistory }: Pick<UserTabData, 'user' | 'fullProfile' | 'workoutHistory'>) {
  return (
    <div>
      <h3 className="text-lg font-black text-gray-900 mb-4">כלכלה וגיימיפיקציה</h3>
      <div className="space-y-6">
      {/* Global XP & Lemur */}
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4">XP והתפתחות למור</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-xs text-blue-600 font-medium">Global XP</p>
            <p className="text-2xl font-black text-blue-700">{fullProfile.progression?.globalXP ?? 0}</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 text-center">
            <p className="text-xs text-purple-600 font-medium">Lemur Stage</p>
            <p className="text-2xl font-black text-purple-700">{(fullProfile.progression as any)?.lemurStage ?? 0}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-xs text-green-600 font-medium">ימים פעילים</p>
            <p className="text-2xl font-black text-green-700">{(fullProfile.progression as any)?.daysActive ?? 0}</p>
          </div>
        </div>
        {/* Level/XP-over-time chart — explicitly NOT built.
            progression.globalLevel/globalXP are overwritten
            in place on every award (XP_Progression_Truth.md
            LAW 0); no levelHistory/xpHistory/xp_log collection
            exists anywhere in this codebase (verified by grep,
            04.10.2026). Flagging per the brief ("if a chart
            needs history that isn't stored, flag it rather
            than fake it") instead of fabricating a trend line
            from a single current snapshot. */}
        <div className="mt-3 bg-gray-50 border border-dashed border-gray-300 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 font-simpler">
            גרף רמה/XP לאורך זמן לא זמין — המערכת לא שומרת היסטוריית רמה/XP לפי תאריך (progression.globalLevel/globalXP מתעדכנים במקום, ללא לוג תקופתי). להציג גרף אמיתי כאן דורש שינוי מודל נתונים (snapshot/log עתי) — לא הוצג נתון מזויף.
          </p>
        </div>
      </div>
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
          <Coins size={20} className="text-yellow-500" />
          כלכלה
        </h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-yellow-50 rounded-xl p-4 text-center">
            <p className="text-xs text-yellow-700 font-medium">יתרת מטבעות</p>
            <p className="text-2xl font-black text-yellow-800">{user?.coins ?? fullProfile.progression?.coins ?? 0}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 text-center">
            <p className="text-xs text-yellow-700 font-medium">הורווחו ב-7 ימים</p>
            <p className="text-2xl font-black text-yellow-800">
              {workoutHistory
                .filter((w) => Date.now() - w.date.getTime() <= 7 * 86_400_000)
                .reduce((sum, w) => sum + (w.earnedCoins || 0), 0)}
            </p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 text-center">
            <p className="text-xs text-yellow-700 font-medium">ממוצע לאימון (50 אחרונים)</p>
            <p className="text-2xl font-black text-yellow-800">
              {workoutHistory.length > 0
                ? Math.round(workoutHistory.reduce((sum, w) => sum + (w.earnedCoins || 0), 0) / workoutHistory.length)
                : 0}
            </p>
          </div>
        </div>
      </div>
      {/* Gamification */}
      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4">גיימיפיקציה</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Avatar ID</p>
            <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.avatarId || 'ברירת מחדל'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">תגים שנפתחו</p>
            <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.unlockedBadges?.length ?? 0} תגים</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">תרגילי בונוס</p>
            <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.unlockedBonusExercises?.length ?? 0} תרגילים</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">קלוריות כוללות</p>
            <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.totalCaloriesBurned ?? 0}</p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
