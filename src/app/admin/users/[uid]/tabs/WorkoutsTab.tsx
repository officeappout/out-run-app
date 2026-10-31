'use client';

import React from 'react';
import { Activity, Coins, Footprints } from 'lucide-react';
import { bucketWorkoutsByDay } from '../../shared.utils';
import { DailyTrendChart } from '../../charts';
import WorkoutHistoryList from '../sections/WorkoutHistoryList';
import type { UserTabData } from './types';

type Props = Pick<UserTabData, 'workoutHistory' | 'stepsHistory'>;

/** אימונים: trend charts, passive step sync, workout history. */
export default function WorkoutsTab({ workoutHistory, stepsHistory }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DailyTrendChart
          title="אימונים ביום (14 הימים האחרונים)"
          icon={<Activity size={16} className="text-cyan-600" />}
          data={bucketWorkoutsByDay(workoutHistory, 14, () => 1)}
          color="#0891B2"
          valueLabel="אימונים"
        />
        <DailyTrendChart
          title="מטבעות שהורווחו ביום (14 הימים האחרונים)"
          icon={<Coins size={16} className="text-yellow-500" />}
          data={bucketWorkoutsByDay(workoutHistory, 14, (w) => w.earnedCoins || 0)}
          color="#CA8A04"
          valueLabel="מטבעות"
        />
      </div>

      <div>
        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
          <Footprints size={20} className="text-emerald-500" />
          פעילות (סנכרון בריאות)
        </h3>
        {stepsHistory.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 italic">
            אין נתוני צעדים מסונכרנים
          </div>
        ) : (() => {
          const today = stepsHistory[stepsHistory.length - 1];
          const last7 = stepsHistory.slice(-7);
          const last7Total = last7.reduce((sum, s) => sum + s.steps, 0);
          const last7Avg = last7.length > 0 ? Math.round(last7Total / last7.length) : 0;
          const last30Total = stepsHistory.reduce((sum, s) => sum + s.steps, 0);
          const last30Avg = stepsHistory.length > 0 ? Math.round(last30Total / stepsHistory.length) : 0;
          return (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="text-xs text-gray-600 mb-1">היום ({today.date})</div>
                <div className="font-black text-2xl text-emerald-700">{today.steps.toLocaleString('he-IL')}</div>
                <div className="text-[11px] text-gray-500 mt-1">צעדים</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="text-xs text-gray-600 mb-1">7 ימים אחרונים</div>
                <div className="font-black text-2xl text-gray-900">{last7Total.toLocaleString('he-IL')}</div>
                <div className="text-[11px] text-gray-500 mt-1">ממוצע: {last7Avg.toLocaleString('he-IL')}/יום</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="text-xs text-gray-600 mb-1">30 ימים אחרונים</div>
                <div className="font-black text-2xl text-gray-900">{last30Total.toLocaleString('he-IL')}</div>
                <div className="text-[11px] text-gray-500 mt-1">ממוצע: {last30Avg.toLocaleString('he-IL')}/יום</div>
              </div>
            </div>
          );
        })()}
        {/* Distance row — real synced distanceMeters (HealthKit
            distanceWalkingRunning / Health Connect DistanceRecord),
            same 30-day stepsHistory window. Omitted entirely (not
            shown as 0) when no day in the window has synced
            distance yet — most users pre-native-release. */}
        {stepsHistory.some((s) => (s.distanceMeters ?? 0) > 0) && (() => {
          const last30DistanceKm = stepsHistory.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0) / 1000;
          return (
            <div className="mt-3 bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-center justify-between">
              <span className="text-xs text-gray-600">מרחק הליכה/ריצה — 30 יום אחרונים</span>
              <span className="font-black text-lg text-cyan-700">{last30DistanceKm.toFixed(1)} ק״מ</span>
            </div>
          );
        })()}
      </div>

      <WorkoutHistoryList workoutHistory={workoutHistory} />
    </div>
  );
}
