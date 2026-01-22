"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import BottomNavigation from '@/components/BottomNavigation';
import HistoryTab from '@/features/profile/components/HistoryTab';
import FreeRunSummary from '@/features/workout-engine/players/running/components/FreeRun/FreeRunSummary';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

export default function ProfilePage() {
  const router = useRouter();
  const { profile, _hasHydrated } = useUserStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'history'>('profile');
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutHistoryEntry | null>(null);

  // בדיקה אם המשתמש השלים Onboarding - רק אחרי שה-Store סיים לטעון מה-localStorage
  React.useEffect(() => {
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

  if (!profile) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-gray-500">מעביר להרשמה...</p>
      </div>
    );
  }

  // If a workout is selected, show the summary in read-only mode
  if (selectedWorkout) {
    return (
      <FreeRunSummary
        workout={selectedWorkout}
        isReadOnly={true}
        onClose={() => setSelectedWorkout(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-3">
          <h1 className="text-xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] bg-clip-text text-transparent mb-3">
            פרופיל
          </h1>
          
          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200">
            {(['profile', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 font-bold transition-colors relative ${
                  activeTab === tab
                    ? 'text-[#00E5FF]'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'profile' && 'פרופיל'}
                {tab === 'history' && 'היסטוריה'}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00E5FF]" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto px-4 py-6">
        {activeTab === 'profile' && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{profile?.core?.name || 'משתמש'}</h2>
            
            <div className="space-y-4">
              {profile?.core?.weight && (
                <div>
                  <label className="text-sm text-gray-500">משקל</label>
                  <p className="text-gray-900 font-medium">{profile.core.weight} ק"ג</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryTab onWorkoutClick={(workout) => setSelectedWorkout(workout)} />
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <BottomNavigation />
    </div>
  );
}
