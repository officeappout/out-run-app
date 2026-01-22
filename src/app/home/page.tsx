"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore, useProgressionStore } from '@/features/user';
import { useSmartSchedule } from '@/features/home/hooks/useSmartSchedule';
import { MOCK_STATS, MOCK_PROGRESS } from '@/features/home/data/mock-schedule-data';
import CoinPill from '@/features/home/components/CoinPill';
import SmartWeeklySchedule from '@/features/home/components/SmartWeeklySchedule';
import StatsOverview from '@/features/home/components/StatsOverview';
import GuestHeroCard from '@/features/home/components/GuestHeroCard';
import ProgressCard from '@/features/home/components/ProgressCard';
import AlertModal from '@/features/home/components/AlertModal';
import SettingsModal from '@/features/home/components/SettingsModal';
// BottomNavigation removed (rendered in layout)

import { LogOut, RefreshCcw, Settings } from 'lucide-react';
import { signOutUser } from '@/lib/auth.service';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { UserFullProfile } from '@/types/user-profile';

export default function HomePage() {
  const router = useRouter();
  const { profile, _hasHydrated, resetProfile, refreshProfile } = useUserStore();
  const { goalHistory } = useProgressionStore(); // Listen to progression changes
  const { reset: resetOnboarding } = useOnboardingStore();
  const scheduleState = useSmartSchedule();
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Check if in development mode
  const isDev = process.env.NODE_ENV === 'development';

  // טיפול בפתיחת Alert
  React.useEffect(() => {
    if (scheduleState.showMissedAlert) {
      setShowAlert('missed');
    } else if (scheduleState.showComebackAlert) {
      setShowAlert('comeback');
    }
  }, [scheduleState.showMissedAlert, scheduleState.showComebackAlert]);

  // Force refresh profile from Firestore once we know we're hydrated and have a user
  useEffect(() => {
    if (_hasHydrated && profile?.id) {
      refreshProfile().catch((error) => {
        console.error('[HomePage] Error refreshing profile:', error);
      });
    }
  }, [_hasHydrated, profile?.id, refreshProfile]);

  const handleStartWorkout = () => {
    // מעבר למסך האימון
    router.push('/run');
  };

  const handleLogout = async () => {
    await signOutUser();
    resetProfile();
    // Optional: Force reload or redirect to ensure clean state, 
    // though resetProfile should trigger UI updates (authentication guard will kick in)
    // router.replace('/onboarding'); // Logic in useEffect below handles this
  };

  const handleAlertAction = () => {
    setShowAlert(null);
    handleStartWorkout();
  };

  const handleAlertClose = () => {
    setShowAlert(null);
  };

  const handleDevReset = async () => {
    if (!isDev) return; // Safety check - should never reach here in prod
    
    if (!confirm('⚠️ Dev Reset: זה ימחק את כל הנתונים המקומיים ויתנתק. להמשיך?')) {
      return;
    }

    try {
      // 1. Clear all localStorage
      localStorage.clear();
      
      // 2. Clear sessionStorage
      sessionStorage.clear();
      
      // 3. Reset Onboarding Store
      resetOnboarding();
      
      // 4. Reset User Store
      resetProfile();
      
      // 5. Sign out from Firebase Auth
      await signOut(auth);
      
      // 6. Redirect to welcome screen (home)
      router.push('/');
    } catch (error) {
      console.error('Error during dev reset:', error);
      alert('שגיאה באיפוס. נסה שוב.');
    }
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
      <div className="h-[100dvh] flex items-center justify-center" style={{ height: '100dvh' }}>
        <p className="text-gray-500">טוען...</p>
      </div>
    );
  }

  // אם אין פרופיל אחרי rehydration - מציג loading עד redirect
  if (!profile) {
    return (
      <div className="h-[100dvh] flex items-center justify-center" style={{ height: '100dvh' }}>
        <p className="text-gray-500">מעביר להרשמה...</p>
      </div>
    );
  }

  // A user is only considered a guest if they have no email AND no onboarding schedule data
  const hasOnboardingSchedule = !!(
    profile.lifestyle?.scheduleDays &&
    profile.lifestyle.scheduleDays.length > 0
  );
  const isGuest = !!(profile?.id && !profile.core?.email && !hasOnboardingSchedule);
  const userName = profile?.core?.name || 'OUTer';
  const isRestDay = scheduleState.scenario === 'rest';
  // Dynamic Track: Read directly from profile store
  const currentTrack = profile?.core?.trackingMode || 'wellness'; // 'wellness' = HEALTH, 'performance' = PERFORMANCE

  // Helper: Check if user has completed onboarding
  const hasCompletedOnboarding = (userProfile: UserFullProfile | null): boolean => {
    if (!userProfile) return false;
    // Check if user has progression data and schedule days (indicates completed onboarding)
    return !!(
      userProfile.progression &&
      userProfile.progression.domains &&
      Object.keys(userProfile.progression.domains).length > 0 &&
      userProfile.lifestyle?.scheduleDays &&
      userProfile.lifestyle.scheduleDays.length > 0
    );
  };

  // Helper: Get fitness level from profile (based on initialFitnessTier or domain levels)
  const getFitnessLevel = (userProfile: UserFullProfile | null): number => {
    if (!userProfile?.progression?.domains) return 0;
    
    // Try to get level from a primary domain (upper_body is usually the main one)
    const primaryDomain = userProfile.progression.domains.upper_body || 
                         userProfile.progression.domains.lower_body ||
                         userProfile.progression.domains.full_body ||
                         userProfile.progression.domains.core;
    
    if (primaryDomain?.currentLevel) {
      return primaryDomain.currentLevel;
    }
    
    // Fallback to initialFitnessTier mapping
    const initialTier = userProfile.core?.initialFitnessTier || 1;
    return initialTier === 1 ? 1 : initialTier === 2 ? 3 : 5;
  };

  // Helper: Calculate progress percentage towards next level (starts at 0% for new users)
  const calculateProgressPercentage = (userProfile: UserFullProfile | null): number => {
    if (!userProfile?.progression) return 0;
    
    // For new users (no XP), return 0% (as seen in summary)
    if (!userProfile.progression.globalXP || userProfile.progression.globalXP === 0) {
      return 0;
    }
    
    // Calculate percentage based on XP (simplified - can be enhanced with actual XP-to-level logic)
    const currentLevel = getFitnessLevel(userProfile);
    const nextLevelXP = currentLevel * 1000; // Mock XP requirement (1000 XP per level)
    const currentXP = userProfile.progression.globalXP || 0;
    const progressXP = currentXP % 1000; // XP within current level
    
    return Math.min(Math.round((progressXP / nextLevelXP) * 100), 99); // Cap at 99%
  };

  return (
    <div className="min-h-[100dvh] bg-[#F3F5F9] pb-20" style={{ minHeight: '100dvh', paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header - Sticky with Gradient Logo and CoinPill */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-100 dark:border-slate-800">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
          {/* Left: Settings & Logout */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-full active:scale-95 transition-all"
              title="הגדרות"
            >
              <Settings size={24} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full active:scale-95 transition-all"
              title="התנתק"
            >
              <LogOut size={24} />
            </button>
          </div>

          {/* Center: Gradient Logo */}
          <h1 className="text-3xl font-black bg-gradient-to-r from-[#00C9F2] to-[#00B8D4] bg-clip-text text-transparent tracking-tighter">
            OUT
          </h1>

          {/* Right: Coins Pill */}
          <CoinPill />
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Greeting */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              היי {profile?.core?.name || userName}!
            </h2>
            {profile?.progression && hasCompletedOnboarding(profile) && (
              <p className="text-sm text-gray-500 mt-1">
                רמה {getFitnessLevel(profile)}
                {profile.progression.globalLevel && profile.progression.globalLevel > 0 && (
                  <span className="text-xs text-gray-400"> • רוב המשתמשים מגיעים לרמה {getFitnessLevel(profile) + 1} תוך 6 שבועות</span>
                )}
              </p>
            )}
          </div>
          <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden border border-gray-300">
            {profile?.core?.photoURL ? (
              <img src={profile.core.photoURL} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Guest Lock Overlay Logic */}
        {/* Guest Lock Overlay REMOVED */}

        <div className="relative">
          {/* Smart Weekly Schedule - Hybrid component based on track */}
          <div className="relative z-10">
            <SmartWeeklySchedule 
              schedule={scheduleState.weekSchedule || []} 
              currentTrack={currentTrack}
              scheduleDays={profile?.lifestyle?.scheduleDays || []}
            />
          </div>

          {/* Stats Overview - Conditional widgets based on track */}
          <div className="relative z-10">
            <StatsOverview
              stats={MOCK_STATS}
              currentTrack={currentTrack}
              isGuest={isGuest}
              onStartWorkout={handleStartWorkout}
            />
          </div>
        </div>

        {/* Hero Workout Card is now rendered inside StatsOverview */}

        {/* Progress Card - Always unlocked for users with a profile */}
        <div>
          <ProgressCard 
            progress={profile?.progression ? {
              domain: 'כללי',
              currentLevel: getFitnessLevel(profile),
              maxLevel: 10,
              percentage: calculateProgressPercentage(profile),
            } : null}
            isLocked={!profile}
          />
        </div>
      </div>

      {/* Alert Modals */}
      {showAlert && (
        <AlertModal
          type={showAlert as 'missed' | 'comeback'}
          onClose={handleAlertClose}
          onAction={handleAlertAction}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Dev-Only Reset Button */}
      {isDev && (
        <button
          onClick={handleDevReset}
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-lg shadow-lg transition-all active:scale-95"
          title="Dev Reset - מחק כל הנתונים והתחיל מחדש"
        >
          <RefreshCcw size={16} />
          <span>Dev Reset</span>
        </button>
      )}

      {/* Bottom Navigation Removed */}
    </div>
  );
}
