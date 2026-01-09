"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user/store/useUserStore';
import BottomNavigation from '@/components/BottomNavigation';

export default function ProfilePage() {
  const router = useRouter();
  const { profile, _hasHydrated } = useUserStore();

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

  return (
    <div className="min-h-screen bg-[#F3F4F6] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#00B8D4] bg-clip-text text-transparent">
            פרופיל
          </h1>
        </div>
      </div>

      {/* Profile Content */}
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{profile?.core?.name || 'משתמש'}</h2>
          
          <div className="space-y-4">
            
            {profile?.core?.weight && (
              <div>
                <label className="text-sm text-gray-500">משקל</label>
                <p className="text-gray-900 font-medium">{profile.core.weight} ק&quot;ג</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <BottomNavigation />
    </div>
  );
}
