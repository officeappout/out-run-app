"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user/store/useUserStore';
import { useSmartSchedule } from '@/features/home/hooks/useSmartSchedule';
import { MOCK_STATS, MOCK_PROGRESS } from '@/features/home/data/mock-schedule-data';
import CoinPill from '@/features/home/components/CoinPill';
import ScheduleCalendar from '@/features/home/components/ScheduleCalendar';
import StatsWidgets from '@/features/home/components/StatsWidgets';
import HeroCard from '@/features/home/components/HeroCard';
import ProgressCard from '@/features/home/components/ProgressCard';
import AlertModal from '@/features/home/components/AlertModal';
import BottomNavigation from '@/components/BottomNavigation';

export default function HomePage() {
  const router = useRouter();
  const { profile, _hasHydrated } = useUserStore();
  const scheduleState = useSmartSchedule();
  const [showAlert, setShowAlert] = useState<string | null>(null);

  // טיפול בפתיחת Alert
  React.useEffect(() => {
    if (scheduleState.showMissedAlert) {
      setShowAlert('missed');
    } else if (scheduleState.showComebackAlert) {
      setShowAlert('comeback');
    }
  }, [scheduleState.showMissedAlert, scheduleState.showComebackAlert]);

  const handleStartWorkout = () => {
    // מעבר למסך האימון
    router.push('/run');
  };

  const handleAlertAction = () => {
    setShowAlert(null);
    handleStartWorkout();
  };

  const handleAlertClose = () => {
    setShowAlert(null);
  };

  // בדיקה אם המשתמש השלים Onboarding - רק אחרי שה-Store סיים לטעון מה-localStorage
  useEffect(() => {
    // רק אם ה-Store סיים את ה-rehydration ואז אין פרופיל
    if (_hasHydrated && !profile) {
      router.replace('/onboarding');
    }
  }, [_hasHydrated, profile, router]);

  // מצב טעינה - הצג loading screen עד שה-Store טוען מה-localStorage
  if (!_hasHydrated) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-gray-500">טוען...</p>
      </div>
    );
  }

  // אם אין פרופיל אחרי rehydration - מציג loading עד redirect
  if (!profile) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-gray-500">מעביר להרשמה...</p>
      </div>
    );
  }

  const userName = profile?.core?.name || 'משתמש';
  const isRestDay = scheduleState.scenario === 'rest';
  const isWellnessMode = scheduleState.trackingMode === 'wellness';

  return (
    <div className="min-h-screen bg-[#F3F4F6] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          {/* Left: Menu */}
          <button className="p-2 text-gray-700 active:scale-95 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Center: Logo */}
          <h1 className="text-xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] bg-clip-text text-transparent">
            OUT
          </h1>

          {/* Right: Coins */}
          <CoinPill />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Greeting */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              היי {userName}, משפט מוטיבציה יומי
            </h2>
          </div>
          <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
        </div>

        {/* Schedule Calendar */}
        <ScheduleCalendar schedule={scheduleState.weekSchedule} />

        {/* Stats Widgets - דגש על צעדים ב-Wellness Mode */}
        <StatsWidgets stats={MOCK_STATS} emphasizeSteps={isWellnessMode} />

        {/* Hero Card */}
        {scheduleState.currentWorkout && (
          <HeroCard
            workout={scheduleState.currentWorkout}
            isRestDay={isRestDay}
            isPostWorkout={scheduleState.showPostWorkout}
            postWorkoutData={scheduleState.postWorkoutData}
            onStart={handleStartWorkout}
          />
        )}

        {/* Progress Card */}
        <ProgressCard progress={MOCK_PROGRESS} />
      </div>

      {/* Alert Modals */}
      {showAlert && (
        <AlertModal
          type={showAlert as 'missed' | 'comeback'}
          onClose={handleAlertClose}
          onAction={handleAlertAction}
        />
      )}

      {/* Bottom Navigation Bar */}
      <BottomNavigation />
    </div>
  );
}
