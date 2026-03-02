"use client";

/**
 * FullMapView — The heavy map experience with route generation, GPS tracking,
 * workout player, and all related services.
 *
 * This file is DYNAMICALLY IMPORTED by page.tsx so that none of its
 * transitive dependencies (useMapLogic, RouteGenerator, MapboxService, etc.)
 * are loaded while the Explorer overlay is active.
 */

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import dynamicImport from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useMapLogic } from '@/features/parks';
import { useUserStore } from '@/features/user';
import { syncFieldToFirestore } from '@/lib/firestore.service';

// UI Components
import BottomJourneyContainer from '@/features/parks/core/components/BottomJourneyContainer';
import WorkoutPreferencesModal from '@/features/parks/core/components/WorkoutPreferencesModal';
import { WorkoutPreviewDrawer } from '@/features/workout-engine/players/strength';

import { ActiveDashboard } from '@/features/workout-engine/players/running';
import WorkoutSummaryPage from '@/features/workout-engine/summary/WorkoutSummaryPage';
import { StrengthDopamineScreen, StrengthSummaryPage } from '@/features/workout-engine/components/strength';
import ParticleBackground from '@/components/ParticleBackground';
import ChatDrawer from '@/features/parks/core/components/ChatDrawer';
import NavigationHub from '@/features/parks/core/components/NavigationHub';
import RouteGenerationLoader from '@/features/parks/core/components/RouteGenerationLoader';
import { Search, SlidersHorizontal, Navigation, Sparkles, Home, Briefcase, Bookmark, MapPin, X, Users, Globe, Bug, Lock } from 'lucide-react';
import { WorkoutPlan } from '@/features/parks';
import { useSessionStore } from '@/features/workout-engine';
import { JITSetupModal } from '@/features/user/onboarding/components/JITSetupModal';
import SafeCityOverlay from '@/features/safecity/components/SafeCityOverlay';
import { useSafeCityMap } from '@/features/safecity/hooks/useSafeCityMap';
import { useSocialLiveMap } from '@/features/safecity/hooks/useSocialLiveMap';
import LiveFriendMarker from '@/features/safecity/components/LiveFriendMarker';
import KudoSheet from '@/features/safecity/components/KudoSheet';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import type { PresenceMarker } from '@/features/safecity/services/segregation.service';
import { useFlyoverEntrance } from '@/features/safecity/hooks/useFlyoverEntrance';
import { seedMockLemurs, clearMockLemurs } from '@/features/safecity/services/presence.service';
import ViralUnlockSheet from '@/features/safecity/components/ViralUnlockSheet';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Check as CheckIcon } from 'lucide-react';

const AppMap = dynamicImport(() => import('@/features/parks/core/components/AppMap'), {
  loading: () => <div className="h-full w-full bg-[#f3f4f6]" />,
  ssr: false,
});

const UnifiedLocationStep = lazy(
  () => import('@/features/user/onboarding/components/steps/UnifiedLocationStep')
);

const BRAND_COLOR = '#00E5FF';
const GRAY_COLOR = '#6B7280';

const demoWorkoutPlan: WorkoutPlan = {
  id: 'demo-workout-1',
  name: 'אימון בוקר משולב',
  totalDuration: 45,
  difficulty: 'medium',
  segments: [
    { id: 'seg-1', type: 'travel', title: 'חימום - הליכה מהירה', subTitle: 'התחילו בהליכה נמרצת', icon: 'run', target: { type: 'time', value: 5, unit: 'דק׳' }, isCompleted: false, paceTarget: 'קצב נוח' },
    { id: 'seg-2', type: 'station', title: 'תחנה 1: ספסל בפארק', subTitle: 'תרגילי חזה וכתפיים', icon: 'bench', target: { type: 'time', value: 10, unit: 'דק׳' }, isCompleted: false, exercises: [{ id: 'ex-1', name: 'שכיבות סמיכה', reps: '15 חזרות', icon: 'dumbbell' }] },
    { id: 'seg-3', type: 'travel', title: 'ריצה - קצב גבוה', subTitle: 'ריצה בקצב גבוה עד לתחנה הבאה', icon: 'run', target: { type: 'distance', value: 800, unit: 'מ׳' }, isCompleted: false, paceTarget: '4:45', heartRateTarget: '150-165' },
    { id: 'seg-4', type: 'station', title: 'תחנה 2: גינת כושר', subTitle: 'תרגילי משיכה וליבה', icon: 'gym', target: { type: 'time', value: 12, unit: 'דק׳' }, isCompleted: false, exercises: [{ id: 'ex-3', name: 'מתח', reps: 'מקסימום חזרות', icon: 'dumbbell' }] },
  ]
};

export default function FullMapView() {
  const logic = useMapLogic();
  const { status: runStatus } = useSessionStore();
  const safecity = useSafeCityMap(logic.currentUserPos ?? null);
  const flyover = useFlyoverEntrance(logic.currentUserPos ?? null);
  const social = useSocialLiveMap(logic.currentUserPos ?? null, flyover.flyoverComplete);
  const { profile, refreshProfile, getSocialUnlocked } = useUserStore();
  const socialUnlocked = getSocialUnlocked();
  const { celebrate } = useGoalCelebration();

  // Kudo Sheet state
  const [kudoTarget, setKudoTarget] = useState<PresenceMarker | null>(null);

  // Viral gate sheet
  const [viralSheetOpen, setViralSheetOpen] = useState(false);

  // Referral reward: toast + confetti + lock→checkmark
  const [referralToast, setReferralToast] = useState<string | null>(null);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const prevReferralCount = useRef<number | null>(null);

  useEffect(() => {
    const uid = profile?.id;
    if (!uid) return;

    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      const data = snap.data();
      if (!data) return;
      const newCount: number = data.core?.referralCount ?? 0;
      const prev = prevReferralCount.current;

      if (prev !== null && newCount > prev) {
        setReferralToast(`שותף חדש הצטרף לנבחרת! עכשיו אווטיר ב-Out 🤘`);
        setTimeout(() => setReferralToast(null), 4000);

        if (newCount >= 1 && prev < 1) {
          setJustUnlocked(true);
          celebrate('referral_unlock', 300);
          refreshProfile();
          setTimeout(() => setJustUnlocked(false), 3000);
        }
      }
      prevReferralCount.current = newCount;
    });

    return () => unsub();
  }, [profile?.id, celebrate, refreshProfile]);

  const handleKudoSent = useCallback(() => {
    celebrate('kudo_sent_' + Date.now(), 0);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([15, 30, 15]);
    }
  }, [celebrate]);

  // ── DEBUG: Social layer rendering gate ──
  useEffect(() => {
    console.log('[FullMapView] 🗺️ Social layer state:', {
      isWorkoutActive: logic.isWorkoutActive,
      socialIsBlocked: social.isBlocked,
      socialMode: social.mode,
      socialMarkerCount: social.markers.length,
      flyoverComplete: flyover.flyoverComplete,
      flyoverActive: flyover.flyoverActive,
      willRenderToggle: !logic.isWorkoutActive && !social.isBlocked,
      willRenderMarkers: !logic.isWorkoutActive && !social.isBlocked && social.markers.length > 0,
    });
  }, [logic.isWorkoutActive, social.isBlocked, social.mode, social.markers.length, flyover.flyoverComplete, flyover.flyoverActive]);

  // ── DEBUG: Seed mock lemurs (ref-backed so IDs survive re-renders) ──
  const mockIdsRef = useRef<string[]>([]);
  const [hasMocks, setHasMocks] = useState(false);

  const handleSeedMock = useCallback(async () => {
    const pos = logic.currentUserPos;
    if (!pos) {
      console.warn('[SeedMock] ⚠️ No user location — cannot seed');
      return;
    }
    const level = profile?.progression?.lemurStage ?? 3;
    console.log('[SeedMock] 🚀 Seeding 5 mock lemurs...', { lat: pos.lat, lng: pos.lng, level });
    const ids = await seedMockLemurs(pos, level, 5);
    mockIdsRef.current = ids;
    setHasMocks(true);
    console.log('[SeedMock] ✅ Stored IDs:', ids);
  }, [logic.currentUserPos, profile?.progression?.lemurStage]);

  const handleClearMock = useCallback(async () => {
    const ids = mockIdsRef.current;
    if (ids.length === 0) {
      console.warn('[SeedMock] ⚠️ No mock IDs to clear');
      return;
    }
    console.log('[SeedMock] 🧹 Clearing', ids.length, 'mocks...');
    await clearMockLemurs(ids);
    mockIdsRef.current = [];
    setHasMocks(false);
  }, []);

  // Bridge Mode: prompt Assessment-path users who have no authorityId
  const [showLocationBridge, setShowLocationBridge] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const hasAuthority = !!profile.core?.authorityId;
    const isMapOnly = profile.onboardingPath === 'MAP_ONLY';
    if (!hasAuthority && !isMapOnly) {
      setShowLocationBridge(true);
    }
  }, [profile]);

  const handleBridgeComplete = async () => {
    const authorityId = typeof window !== 'undefined'
      ? sessionStorage.getItem('selected_authority_id')
      : null;
    if (authorityId) {
      await syncFieldToFirestore('core.authorityId', authorityId);
      refreshProfile();
    }
    setShowLocationBridge(false);
  };

  return (
    <main className="relative h-[100dvh] w-full bg-[#f3f4f6] overflow-hidden font-sans" style={{ height: '100dvh' }}>
      {!logic.isWorkoutActive && <div className="absolute inset-0 z-[-1] pointer-events-none"><ParticleBackground /></div>}

      {/* --- THE MAP --- */}
      <div className="absolute inset-0 z-0">
        <AppMap
          routes={logic.isWorkoutActive ? (logic.focusedRoute ? [logic.focusedRoute] : []) : (logic.routesToDisplay || [])}
          currentLocation={logic.currentUserPos}
          userBearing={logic.userBearing}
          livePath={logic.isWorkoutActive ? logic.livePath : undefined}
          isActiveWorkout={logic.isWorkoutActive}
          isNavigationMode={logic.isNavigationMode}
          onRouteSelect={logic.setSelectedRoute}
          selectedRoute={logic.selectedRoute}
          onMapRef={flyover.handleMapRef}
          skipInitialZoom={flyover.flyoverActive}
        />
      </div>

      {/* --- Safe-City Presence Overlay --- */}
      {!logic.isWorkoutActive && (
        <SafeCityOverlay
          markers={safecity.markers}
          heatmapCount={safecity.heatmap.length}
          privacyMode={safecity.privacyMode}
          ageGroup={safecity.myAgeGroup}
        />
      )}

      {/* --- Social Live Map Layer (non-student only) --- */}
      {!logic.isWorkoutActive && !social.isBlocked && (
        <>
          {/* Mode toggle: Friends / Discover — above Safe-City badges (z-30) */}
          <div className="absolute top-20 left-4 z-30">
            <div className="flex bg-white/90 backdrop-blur-sm rounded-xl shadow-md border border-gray-100 overflow-hidden">
              <button
                onClick={() => {
                  if (!socialUnlocked) {
                    setViralSheetOpen(true);
                    return;
                  }
                  social.setMode('friends');
                }}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold transition-colors ${
                  social.mode === 'friends' && socialUnlocked
                    ? 'bg-[#00BAF7] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Users size={12} />
                <span>שותפים</span>
                {!socialUnlocked && !justUnlocked && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-sm border border-white"
                  >
                    <Lock size={8} className="text-white" strokeWidth={3} />
                  </span>
                )}
                {justUnlocked && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.4, 1] }}
                    transition={{ duration: 0.5 }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-md border-2 border-white"
                  >
                    <CheckIcon size={10} className="text-white" strokeWidth={3} />
                  </motion.span>
                )}
              </button>
              <button
                onClick={() => social.setMode('discover')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold transition-colors ${
                  social.mode === 'discover'
                    ? 'bg-[#00BAF7] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Globe size={12} />
                <span>גלה</span>
              </button>
            </div>
          </div>

          {/* Live friend strip — horizontal scroll above route cards (z-25) */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-[360px] left-0 right-0 z-[25] px-3 pointer-events-none"
          >
            {social.markers.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide pointer-events-auto" dir="rtl">
                {social.markers.map((m) => (
                  <div key={m.uid} className="flex-shrink-0">
                    <LiveFriendMarker marker={m} size={44} onClick={setKudoTarget} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-2 px-4 bg-white/80 backdrop-blur-sm rounded-xl shadow border border-cyan-100 pointer-events-auto" dir="rtl">
                <p className="text-[11px] text-gray-400 font-medium">
                  {social.isLoading
                    ? '⏳ מחפש אווטירים...'
                    : social.mode === 'friends'
                      ? '👀 אף שותף לא פעיל כרגע'
                      : '🌍 אין אווטירים בסביבה'}
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}

      {/* --- Active Workout UI --- */}
      {logic.isWorkoutActive && logic.workoutStartTime && !logic.showSummary && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          <ActiveDashboard />
        </div>
      )}

      {/* --- Normal UI (not running) --- */}
      {!logic.isWorkoutActive && !logic.showSummary && (
        <>
          <NavigationHub
            navState={logic.navState}
            onStateChange={logic.setNavState}
            searchQuery={logic.searchQuery}
            onSearchChange={logic.setSearchQuery}
            suggestions={logic.suggestions}
            onAddressSelect={logic.handleAddressSelect}
            navigationRoutes={logic.navigationRoutes}
            selectedActivity={logic.selectedNavActivity}
            onActivitySelect={(type) => { logic.setSelectedNavActivity(type); logic.setFocusedRoute(logic.navigationRoutes[type]); }}
            isLoading={logic.isGenerating}
            isSearching={logic.isSearching}
            onShuffle={logic.handleShuffle}
            onStart={logic.startActiveWorkout}
            inputRef={logic.searchInputRef}
          />

          <div className={`absolute top-0 left-0 right-0 z-[70] pt-[max(1.5rem,env(safe-area-inset-top))] px-4 pointer-events-none transition-opacity`}>
            <div className="max-w-md mx-auto w-full pointer-events-auto flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button onClick={() => logic.setIsFilterOpen(true)} className="h-12 w-12 rounded-2xl bg-white shadow-lg flex items-center justify-center border border-gray-100 text-gray-700 active:scale-95 transition-all">
                  <SlidersHorizontal size={22} />
                </button>

                <div className="flex-1 relative">
                  <div className="bg-white shadow-lg rounded-2xl h-12 flex items-center px-2 border border-gray-100 overflow-hidden">
                    <div className="flex-1 flex items-center h-full">
                      <Search className="text-gray-400 ms-2 shrink-0" size={20} />
                      <input
                        ref={logic.searchInputRef}
                        type="text"
                        placeholder={logic.navState === 'idle' ? "חיפוש מסלול..." : "לאן רוצים להגיע?"}
                        value={logic.searchQuery}
                        onFocus={() => { if (logic.navState === 'idle') logic.setNavState('searching'); }}
                        onChange={(e) => logic.setSearchQuery(e.target.value)}
                        className="w-full h-full bg-transparent border-none outline-none text-sm text-gray-700 px-2 placeholder:text-gray-400 text-right font-bold"
                      />
                    </div>
                    {logic.navState !== 'idle' ? (
                      <button
                        onClick={() => {
                          logic.setNavState('idle');
                          logic.setSearchQuery('');
                          if (logic.searchInputRef.current) logic.searchInputRef.current.blur();
                        }}
                        className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors me-2"
                      >
                        <X size={20} className="text-gray-400" />
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          const prompt = logic.searchQuery.trim() || "תן לי מוטיבציה לאימון!";
                          await logic.handleAICoachRequest(prompt);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[11px] font-bold shadow-md hover:shadow-purple-500/40 active:scale-95 transition-all whitespace-nowrap ms-1"
                      >
                        <Sparkles size={14} fill="currentColor" className="animate-pulse" />
                        <span>AI Coach</span>
                      </button>
                    )}
                  </div>

                  {logic.navState === 'idle' && logic.suggestions.length > 0 && logic.searchQuery.length > 2 && (
                    <div className="absolute top-14 left-0 right-0 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      {logic.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => logic.handleAddressSelect(s)}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 text-right transition-colors border-b last:border-none border-gray-50"
                          dir="rtl"
                        >
                          <MapPin size={16} className="text-gray-400" />
                          <span className="text-sm font-medium text-gray-700 truncate">{s.text}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Access Buttons */}
              {logic.navState === 'searching' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="flex gap-2" 
                  dir="rtl"
                >
                  <button 
                    onClick={() => {
                      logic.setSearchQuery('בית');
                      if (logic.searchInputRef.current) logic.searchInputRef.current.focus();
                    }} 
                    className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full shadow-sm border border-gray-100 text-gray-600 text-[11px] font-bold hover:bg-white transition-all active:scale-95"
                  >
                    <Home size={14} className="text-cyan-500" />
                    <span>בית</span>
                  </button>
                  <button 
                    onClick={() => {
                      logic.setSearchQuery('עבודה');
                      if (logic.searchInputRef.current) logic.searchInputRef.current.focus();
                    }} 
                    className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full shadow-sm border border-gray-100 text-gray-600 text-[11px] font-bold hover:bg-white transition-all active:scale-95"
                  >
                    <Briefcase size={14} className="text-purple-500" />
                    <span>עבודה</span>
                  </button>
                  <button 
                    onClick={() => {
                      logic.setSearchQuery('שמורים');
                      if (logic.searchInputRef.current) logic.searchInputRef.current.focus();
                    }} 
                    className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full shadow-sm border border-gray-100 text-gray-600 text-[11px] font-bold hover:bg-white transition-all active:scale-95"
                  >
                    <Bookmark size={14} className="text-amber-500" />
                    <span>שמורים</span>
                  </button>
                </motion.div>
              )}
            </div>
          </div>

          <div className="absolute right-4 z-40 bottom-[350px] flex flex-col gap-2">
            <button onClick={logic.handleLocationClick} className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center bg-white pointer-events-auto active:scale-95 transition-all">
              <Navigation size={20} fill={logic.isFollowing ? BRAND_COLOR : "none"} color={logic.isFollowing ? BRAND_COLOR : GRAY_COLOR} />
            </button>
            {/* DEBUG: Seed / Clear mock lemurs */}
            <button
              onClick={hasMocks ? handleClearMock : handleSeedMock}
              className={`w-12 h-12 rounded-full shadow-xl flex items-center justify-center pointer-events-auto active:scale-95 transition-all ${
                hasMocks ? 'bg-red-100 text-red-600' : 'bg-cyan-100 text-cyan-700'
              }`}
            >
              <Bug size={18} />
            </button>
          </div>

          {logic.navState === 'idle' && !logic.isWorkoutActive && (
            <BottomJourneyContainer
              routes={logic.workoutMode === 'free' ? [] : (logic.routesToDisplay || [])}
              currentActivity={logic.preferences.activity}
              onActivityChange={logic.handleActivityChange}
              userLocation={logic.currentUserPos}
              onShuffle={() => { logic.setRouteGenerationIndex(prev => prev + 1); logic.setSmartPaths({}); }}
              onRouteFocus={(r) => { logic.setFocusedRoute(r); logic.setSelectedRoute(r); }}
              focusedRouteId={logic.focusedRoute?.id || null}
              workoutMode={logic.workoutMode}
              onModeChange={(mode) => { logic.setWorkoutMode(mode); if (mode === 'free') { logic.setFocusedRoute(null); logic.setSelectedRoute(null); } }}
              loadingRouteIds={logic.loadingRouteIds}
              onShowDetails={() => logic.setShowDetailsDrawer(true)}
              onStartWorkout={logic.startActiveWorkout}
            />
          )}
          {/* Global BottomNavbar is rendered by ClientLayout — no local duplicate */}
        </>
      )}

      {/* MODALS & DRAWERS */}
      {logic.isGenerating && <RouteGenerationLoader />}
      
      {/* WORKOUT COMPLETION FLOW */}
      {logic.showDopamine && (
        <StrengthDopamineScreen
          initialProgress={63}
          currentLevel={5}
          programName={logic.workoutMode === 'free' ? 'אימון חופשי' : 'אימון מסלול'}
          onShare={() => { console.log('Share clicked'); }}
          onBack={() => {
            logic.setShowDopamine(false);
            logic.setShowSummary(true);
          }}
        />
      )}
      
      {logic.showSummary && logic.workoutMode !== 'free' && (
        <StrengthSummaryPage
          duration={logic.elapsedTime || 0}
          totalReps={0}
          completedExercises={[]}
          difficulty="medium"
          streak={3}
          programName="תוכנית כל הגוף"
          currentLevel={5}
          maxLevel={10}
          progressToNextLevel={80}
          onFinish={() => {
            logic.setShowSummary(false);
            logic.setIsWorkoutActive(false);
          }}
        />
      )}
      
      {logic.showSummary && logic.workoutMode === 'free' && (
        <WorkoutSummaryPage
          onFinish={() => {
            logic.setShowSummary(false);
            logic.setIsWorkoutActive(false);
          }}
          workoutType="FREE_RUN"
        />
      )}

      <WorkoutPreferencesModal
        isOpen={logic.isFilterOpen}
        onClose={() => logic.setIsFilterOpen(false)}
        onUpdate={(newPrefs) => { logic.setSmartPaths({}); logic.setFocusedRoute(null); logic.setRouteGenerationIndex(0); logic.updateFilter(newPrefs); logic.setIsFilterOpen(false); }}
      />

      <ChatDrawer
        isOpen={logic.isChatOpen}
        onClose={() => logic.setIsChatOpen(false)}
        messages={logic.chatMessages}
        onSendMessage={logic.handleAICoachRequest}
        isLoading={logic.isAILoading}
      />

      <WorkoutPreviewDrawer
        isOpen={logic.showDetailsDrawer}
        onClose={() => logic.setShowDetailsDrawer(false)}
        workout={logic.showDetailsDrawer && demoWorkoutPlan ? {
          id: demoWorkoutPlan.id,
          title: demoWorkoutPlan.name,
          duration: typeof demoWorkoutPlan.totalDuration === 'number' ? demoWorkoutPlan.totalDuration : 45,
          difficulty: demoWorkoutPlan.difficulty,
          segments: demoWorkoutPlan.segments.map((seg) => ({
            id: seg.id,
            type: seg.type === 'station' ? 'strength' as const : 'running' as const,
            title: seg.title,
            repsOrDuration: seg.exercises?.[0]?.reps || seg.exercises?.[0]?.duration,
          })),
        } : null}
        onStartWorkout={() => {
          logic.setShowDetailsDrawer(false);
          logic.startActiveWorkout();
        }}
      />

      {/* JIT Setup Modal */}
      <JITSetupModal
        isOpen={logic.jitState.isModalOpen}
        requirements={logic.jitState.requirements}
        onComplete={logic.jitState.onComplete}
        onDismiss={logic.dismissJIT}
        onCancel={logic.cancelJIT}
      />

      {/* Kudo Sheet — High Five interaction */}
      <KudoSheet
        marker={kudoTarget}
        fromUid={profile?.id ?? ''}
        fromName={profile?.core?.name ?? ''}
        onClose={() => setKudoTarget(null)}
        onSent={handleKudoSent}
      />

      {/* Viral Unlock Sheet — referral gate for social features */}
      <ViralUnlockSheet
        isOpen={viralSheetOpen}
        onClose={() => setViralSheetOpen(false)}
      />

      {/* Referral toast */}
      <AnimatePresence>
        {referralToast && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-24 left-4 right-4 z-[95] mx-auto max-w-sm"
          >
            <div className="bg-gray-900/95 backdrop-blur-md rounded-2xl px-5 py-3.5 shadow-2xl flex items-center gap-3" dir="rtl">
              <span className="text-xl">🤘</span>
              <p className="text-[13px] font-bold text-white leading-snug">{referralToast}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Location Bridge — prompts Assessment users who have no authorityId */}
      {showLocationBridge && (
        <Suspense fallback={<div className="fixed inset-0 z-[80] bg-white/80 flex items-center justify-center"><p className="animate-pulse text-slate-500">טוען...</p></div>}>
          <div className="fixed inset-0 z-[80]">
            <UnifiedLocationStep
              mode="bridge"
              onNext={handleBridgeComplete}
            />
          </div>
        </Suspense>
      )}
    </main>
  );
}
