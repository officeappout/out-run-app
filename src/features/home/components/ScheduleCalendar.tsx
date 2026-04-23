"use client";

import React, { useMemo } from 'react';
import { useUserStore, useProgressionStore } from '@/features/user';
import { DaySchedule } from '@/features/home/data/mock-schedule-data';
import type { ActivityType } from '@/features/user';
import { useDailyProgress } from '../hooks/useDailyProgress';
import { resolveDayDisplayProps, DayIconCell } from '@/features/home/utils/day-display.utils';
import { resolveIconKey } from '@/features/content/programs/core/program-icon.util';

interface ScheduleCalendarProps {
  schedule: DaySchedule[];
  onDayClick?: (day: DaySchedule) => void;
}

export default function ScheduleCalendar({ schedule, onDayClick }: ScheduleCalendarProps) {
  const { profile } = useUserStore();
  const { goalHistory } = useProgressionStore();
  const todayProgress = useDailyProgress();

  // Map goalHistory by ISO date for quick lookup of completion / step-goal flags.
  const activityMap = useMemo(() => {
    type ActivityRecord = {
      type: ActivityType;
      isSuper: boolean;
      stepGoalMet: boolean;
    };
    const map = new Map<string, ActivityRecord>();
    if (goalHistory && Array.isArray(goalHistory)) {
      goalHistory.forEach((entry) => {
        let activityType: ActivityType = 'none';
        if (entry.isSuper) {
          activityType = 'super';
        } else if (entry.stepGoalMet || entry.floorGoalMet) {
          activityType = 'micro';
        } else if (entry.stepsAchieved >= 1500 || entry.floorsAchieved >= 1) {
          activityType = 'survival';
        }
        map.set(entry.date, {
          type: activityType,
          isSuper: !!entry.isSuper,
          stepGoalMet: !!(entry.stepGoalMet || entry.floorGoalMet),
        });
      });
    }
    return map;
  }, [goalHistory]);

  /**
   * Map a DaySchedule.status + activity record → input for the centralized
   * resolveDayDisplayProps() engine. This guarantees this legacy calendar
   * uses the same visual language as SmartWeeklySchedule.
   */
  const buildDisplayProps = (date: string, status: DaySchedule['status'], isSelected: boolean) => {
    const record = activityMap.get(date);
    const programIconKey = resolveIconKey(
      todayProgress?.workoutType ?? null,
      profile?.primaryTrack ?? null,
    );

    const state: 'past' | 'today' | 'future' =
      status === 'today' ? 'today' : status === 'scheduled' ? 'future' : 'past';

    const isCompleted =
      status === 'completed' ||
      record?.type === 'super' ||
      (status === 'today' && !!todayProgress?.workoutCompleted);

    const isMissed = status === 'missed';
    const isRest = status === 'rest';
    const stepGoalMet = !!record?.stepGoalMet;

    return resolveDayDisplayProps({
      state,
      isSelected,
      isRest,
      isMissed,
      isCompleted,
      debtCleared: false,
      isSuper: !!record?.isSuper,
      stepGoalMet,
      dominantCategory: null,
      programIconKey,
    });
  };

  return (
    <div className="bg-white rounded-3xl p-5 shadow-card border border-gray-50/50">
      {/* כותרת עליונה */}
      <div className="flex items-center justify-between mb-5 px-1">
        <div className="flex flex-col">
          <h2 className="text-[17px] font-black text-gray-900 leading-tight">לו״ז אימונים</h2>
          <button className="flex items-center gap-1 text-[10px] text-gray-400 font-medium">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth={2} />
            </svg>
            סנכרן ליומן
          </button>
        </div>

        <button className="p-2 bg-gray-50 rounded-full text-gray-300">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        </button>
      </div>

      {/* ימי השבוע */}
      <div className="flex justify-between items-end">
        {schedule.map((day, index) => {
          const isSelectedDay = day.status !== 'rest' && day.status !== 'missed';
          const isToday = day.status === 'today';
          
          // Generate date string for this day (assuming schedule is current week)
          const today = new Date();
          const dayDate = new Date(today);
          dayDate.setDate(today.getDate() - (6 - index)); // Adjust to match schedule index
          const dateString = dayDate.toISOString().split('T')[0];
          
          return (
            <button
              key={index}
              onClick={() => onDayClick?.(day)}
              className="flex flex-col items-center gap-3 transition-transform active:scale-90"
            >
              <span className={`text-[13px] font-bold ${isToday ? 'text-[#00E5FF]' : isSelectedDay ? 'text-gray-700' : 'text-gray-400'}`}>
                {day.day}
              </span>

              <div className="flex items-center justify-center min-h-[32px]">
                {/* Centralized branded day-cell — see day-display.utils.tsx */}
                <DayIconCell
                  props={buildDisplayProps(dateString, day.status, isToday)}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}