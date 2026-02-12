"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore, useProgressionStore } from '@/features/user';
import { useSmartSchedule } from '@/features/home/hooks/useSmartSchedule';
import { MOCK_STATS, MOCK_PROGRESS } from '@/features/home/data/mock-schedule-data';
import UserHeaderPill from '@/features/home/components/UserHeaderPill';
import SmartWeeklySchedule from '@/features/home/components/SmartWeeklySchedule';
import StatsOverview from '@/features/home/components/StatsOverview';
import GuestHeroCard from '@/features/home/components/GuestHeroCard';
import ProgressCard from '@/features/home/components/ProgressCard';
import AlertModal from '@/features/home/components/AlertModal';
import SettingsModal from '@/features/home/components/SettingsModal';
import WorkoutPreviewDrawer from '@/features/workouts/components/WorkoutPreviewDrawer';
import { SmartGreeting } from '@/features/messages';
import SecureAccountBanner from '@/components/SecureAccountBanner';
// BottomNavigation removed (rendered in layout)

import { LogOut, RefreshCcw, Settings } from 'lucide-react';
import { signOutUser } from '@/lib/auth.service';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { UserFullProfile } from '@/types/user-profile';
import { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { doc as firestoreDoc, getDoc } from 'firebase/firestore';

export default function HomePage() {
  const router = useRouter();
  const { profile, _hasHydrated, resetProfile, refreshProfile } = useUserStore();
  const { goalHistory } = useProgressionStore(); // Listen to progression changes
  const { reset: resetOnboarding } = useOnboardingStore();
  const scheduleState = useSmartSchedule();
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<any | null>(null);
  const [showSecureBanner, setShowSecureBanner] = useState(true);
  
  // ── Dynamic workout state (lifted from StatsOverview) ──
  // generatedWorkout is the SINGLE SOURCE OF TRUTH for the current workout.
  // workoutVersion increments on every generation/adjustment to force a
  // full re-render of the WorkoutPreviewDrawer (clears stale internal state).
  const generatedWorkoutRef = useRef<GeneratedWorkout | null>(null);
  const [generatedWorkout, setGeneratedWorkout] = useState<GeneratedWorkout | null>(null);
  const [workoutVersion, setWorkoutVersion] = useState(0);

  const handleWorkoutGenerated = useCallback((workout: GeneratedWorkout) => {
    console.log('[HomePage] Workout generated/updated — syncing state', workout.title);
    generatedWorkoutRef.current = workout;
    setGeneratedWorkout(workout);
    setWorkoutVersion((v) => v + 1);
  }, []);

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
    console.log("[HomePage] Opening Drawer with dynamic workout...");
    
    const today = new Date().toISOString().split('T')[0];
    const uniqueWorkoutId = `workout-${today}-${profile?.id?.slice(0, 8) || 'guest'}`;
    
    // Use generated workout data when available, fallback to schedule data
    const gw = generatedWorkoutRef.current;
    
    const workoutMetadata = {
      id: uniqueWorkoutId,
      title: gw?.title || scheduleState.currentWorkout?.title || 'אימון כוח',
      description: gw?.description || scheduleState.currentWorkout?.description || 'אימון מותאם אישית על פי הרמה שלך',
      level: profile?.progression?.domains?.full_body?.currentLevel?.toString() || 'medium',
      difficulty: gw ? String(gw.difficulty) : (scheduleState.currentWorkout?.difficulty || 'medium'),
      duration: gw?.estimatedDuration || scheduleState.currentWorkout?.duration || 45,
      coverImage: scheduleState.currentWorkout?.imageUrl || 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80',
      segments: [],
    };
    
    setSelectedWorkout(workoutMetadata);
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
  // If localStorage has no profile, fallback to Firestore before redirecting
  const [isCheckingFirestore, setIsCheckingFirestore] = useState(false);
  useEffect(() => {
    if (!_hasHydrated || profile || isCheckingFirestore) return;

    // No profile in localStorage — check Firestore before giving up
    const checkFirestore = async () => {
      setIsCheckingFirestore(true);
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          // Truly unauthenticated — go to onboarding
          router.replace('/onboarding-new/roadmap');
          return;
        }

        const userDocSnap = await getDoc(firestoreDoc(db, 'users', uid));
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const status = userData?.onboardingStatus;

          if (status === 'COMPLETED' || userData?.onboardingComplete) {
            // Onboarding IS done — hydrate the store and stay on /home
            const freshProfile = await getUserFromFirestore(uid);
            if (freshProfile) {
              useUserStore.getState().initializeProfile(freshProfile);
              console.log('[HomePage] Profile recovered from Firestore — staying on /home');
              setIsCheckingFirestore(false);
              return; // stay on /home
            }
          }
        }

        // Onboarding truly not complete — redirect
        router.replace('/onboarding-new/roadmap');
      } catch (e) {
        console.error('[HomePage] Firestore fallback check failed:', e);
        router.replace('/onboarding-new/roadmap');
      } finally {
        setIsCheckingFirestore(false);
      }
    };

    checkFirestore();
  }, [_hasHydrated, profile, router, isCheckingFirestore]);

  // מצב טעינה - הצג loading screen עד שה-Store טוען מה-localStorage
  if (!_hasHydrated) {
    return (
      <div className="h-[100dvh] flex items-center justify-center" style={{ height: '100dvh' }}>
        <p className="text-gray-500">טוען...</p>
      </div>
    );
  }

  // אם אין פרופיל אחרי rehydration - בודקים Firestore לפני redirect
  if (!profile) {
    return (
      <div className="h-[100dvh] flex items-center justify-center" style={{ height: '100dvh' }}>
        <p className="text-gray-500">{isCheckingFirestore ? 'בודק פרופיל...' : 'מעביר להרשמה...'}</p>
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

  // Check if account is unsecured (user skipped AccountSecureStep or used anonymous mode)
  const isAccountUnsecured = (): boolean => {
    // Check from Firestore data if available (will be synced on mount)
    // For now, check if user is anonymous OR if they have no email
    const isAnonymous = auth.currentUser?.isAnonymous || false;
    const hasEmail = !!profile?.core?.email;
    
    // Account is unsecured if: anonymous AND no email (hasn't linked account)
    return isAnonymous && !hasEmail;
  };

  return (
    <div className="min-h-[100dvh] bg-[#F3F5F9] pb-20" style={{ minHeight: '100dvh', paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
      {/* Header - Sticky with Gradient Logo and UserHeaderPill */}
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

          {/* Right: User Header Pill with Avatar, Coins & Dynamic Flame */}
          <UserHeaderPill compact />
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Secure Account Banner - Show if account is unsecured */}
        {isAccountUnsecured() && showSecureBanner && (
          <SecureAccountBanner
            userName={userName}
            onDismiss={() => setShowSecureBanner(false)}
          />
        )}

        {/* Smart Greeting - Dynamic context-aware message */}
        <SmartGreeting 
          variant="default"
          showIcon={true}
          level={getFitnessLevel(profile)}
          program={Object.keys(profile?.progression?.domains || {})[0] || 'full_body'}
        />

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
              onWorkoutGenerated={handleWorkoutGenerated}
            />
          </div>
        </div>

        {/* Hero Workout Card is now rendered inside StatsOverview */}

        {/* Multi-Program Progress Widgets — Accumulative UI */}
        {(() => {
          const tracks = profile?.progression?.tracks;
          const activeProgramIds: string[] = (profile as any)?.activePrograms?.map((ap: any) => ap.programId) || [];
          const trackEntries = tracks ? Object.entries(tracks).filter(([, t]: [string, any]) => t && typeof t.currentLevel === 'number') : [];
          
          // If we have tracked programs, show individual widgets for each
          if (trackEntries.length > 1) {
            return (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-500 px-1">התוכניות הפעילות שלך</h3>
                <div className="grid grid-cols-2 gap-3">
                  {trackEntries.map(([programId, trackData]: [string, any]) => (
                    <ProgressCard
                      key={programId}
                      compact
                      showActivityRings={false}
                      progress={{
                        label: trackData?.displayName || programId.replace(/_/g, ' '),
                        currentLevel: trackData?.currentLevel || 1,
                        maxLevel: trackData?.maxLevel || 10,
                        percentage: trackData?.currentPercent || 0,
                      }}
                      isLocked={false}
                    />
                  ))}
                </div>
              </div>
            );
          }

          // Single-program / fallback: original ProgressCard
          return (
            <ProgressCard 
              progress={profile?.progression ? {
                domain: 'כללי',
                currentLevel: getFitnessLevel(profile),
                maxLevel: 10,
                percentage: calculateProgressPercentage(profile),
              } : null}
              isLocked={!profile}
            />
          );
        })()}
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

      {/* Workout Preview Drawer — key-synced to force full re-render on workout change */}
      <WorkoutPreviewDrawer
        key={`drawer-v${workoutVersion}`}
        isOpen={selectedWorkout !== null}
        onClose={() => setSelectedWorkout(null)}
        workout={selectedWorkout}
        generatedWorkout={generatedWorkout}
        onStartWorkout={(workoutId) => {
          router.push(`/workouts/${workoutId}/active`);
        }}
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
