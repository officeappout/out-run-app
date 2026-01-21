"use client";

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, Lock, Footprints, Flame } from 'lucide-react';
import { useUserStore, useProgressionStore } from '@/features/user';
import { DaySchedule } from '@/features/home/data/mock-schedule-data';
import type { ActivityType } from '@/features/user';

interface ScheduleCalendarProps {
  schedule: DaySchedule[];
  onDayClick?: (day: DaySchedule) => void;
}

export default function ScheduleCalendar({ schedule, onDayClick }: ScheduleCalendarProps) {
  const { profile } = useUserStore();
  const { goalHistory } = useProgressionStore();
  const isGuest = profile?.id && !profile.core?.email; // Guest detection logic

  if (isGuest) {
    return null;
  }

  // Map goalHistory to calendar days for activity type icons
  const activityMap = useMemo(() => {
    const map = new Map<string, ActivityType>();
    if (goalHistory && Array.isArray(goalHistory)) {
      goalHistory.forEach(entry => {
        // Determine activity type based on goal achievement
        let activityType: ActivityType = 'none';
        
        // Priority 1: Check if it's a super workout (full workout completion)
        if (entry.isSuper) {
          activityType = 'super'; // Blue Flame - full workout
        }
        // Priority 2: Check if adaptive goal was met
        else if (entry.stepGoalMet || entry.floorGoalMet) {
          activityType = 'micro'; // Orange Flame - hit adaptive goal
        }
        // Priority 3: Check if baseline was met
        else if (entry.stepsAchieved >= 1500 || entry.floorsAchieved >= 1) {
          activityType = 'survival'; // Checkmark - hit baseline only
        }
        
        map.set(entry.date, activityType);
      });
    }
    return map;
  }, [goalHistory]);

  // Get activity type icon based on goalHistory data
  const getActivityIcon = (date: string, status: DaySchedule['status']) => {
    // If we have activity data from goalHistory, use it
    const activityType = activityMap.get(date);
    
    if (activityType === 'super') {
      // Strong Blue Flame for super workouts
      return (
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/40 relative">
          <Flame className="w-6 h-6 text-white fill-white animate-pulse" />
          <div className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping" />
        </div>
      );
    }
    
    if (activityType === 'micro') {
      // Orange Flame for micro wins
      return (
        <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-orange-500 rounded-full flex items-center justify-center shadow-md shadow-orange-400/30">
          <Flame className="w-5 h-5 text-white fill-white" />
        </div>
      );
    }
    
    if (activityType === 'survival') {
      // Checkmark for survival (baseline only)
      return (
        <div className="w-8 h-8 bg-amber-400 rounded-full flex items-center justify-center shadow-sm">
          <Check className="w-5 h-5 text-white stroke-[3]" />
        </div>
      );
    }

    // Fall back to original status-based icons
    return getOriginalDayIcon(status);
  };

  // Original icon logic for days without activity data
  const getOriginalDayIcon = (status: DaySchedule['status']) => {
    switch (status) {
      case 'completed':
        return (
          <div className="w-8 h-8 bg-[#4CAF50] rounded-full flex items-center justify-center shadow-sm shadow-green-100">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'today':
        return (
          <div className="w-9 h-9 flex items-center justify-center relative">
            {/* טבעת התקדמות עם חיתוך כמו בתמונה */}
            <svg className="absolute w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="16" stroke="#E0F7FA" strokeWidth="3" fill="transparent" />
              <circle
                cx="18" cy="18" r="16"
                stroke="#00E5FF" strokeWidth="3"
                fill="transparent"
                strokeDasharray="100"
                strokeDashoffset="30"
                strokeLinecap="round"
              />
            </svg>
            <div className="w-6 h-6 bg-white rounded-full border border-gray-100 shadow-sm"></div>
          </div>
        );
      case 'rest':
        return (
          <div className="w-8 h-8 flex items-center justify-center">
            <span className="text-gray-300 text-[10px] font-black italic tracking-tighter">zZ</span>
          </div>
        );
      case 'scheduled':
        return (
          <div className="w-8 h-8 flex items-center justify-center">
            <span className="text-xl">💪</span>
          </div>
        );
      default:
        return <div className="w-8 h-8" />;
    }
  };

  return (
    <div className="bg-white rounded-[32px] p-5 shadow-sm border border-gray-50/50">
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

              <div className="flex items-center justify-center min-h-[40px]">
                {/* Show activity icon based on goalHistory or fall back to status */}
                {getActivityIcon(dateString, day.status)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}