"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { Suspense } from 'react';
import dynamicImport from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useMapLogic } from '@/features/parks';

// UI Components
import BottomNavigation from '@/components/BottomNavigation';
import BottomJourneyContainer from '@/features/parks/core/components/BottomJourneyContainer';
import WorkoutPreferencesModal from '@/features/parks/core/components/WorkoutPreferencesModal';
import { LiveWorkoutOverlay, WorkoutPreviewDrawer } from '@/features/workout-engine/players/strength';

import { DopamineScreen, ActiveDashboard } from '@/features/workout-engine/players/running';
import WorkoutSummaryPage from '@/features/workout-engine/summary/WorkoutSummaryPage';
import ParticleBackground from '@/components/ParticleBackground';
import ChatDrawer from '@/features/parks/core/components/ChatDrawer';
import NavigationHub from '@/features/parks/core/components/NavigationHub';
import RouteGenerationLoader from '@/features/parks/core/components/RouteGenerationLoader';
import { Search, SlidersHorizontal, Navigation, Sparkles, Home, Briefcase, Bookmark, MapPin, X } from 'lucide-react';
import { WorkoutPlan } from '@/features/parks';
import { useSessionStore } from '@/features/workout-engine';

// טוען את המפה החדשה והמהירה
const AppMap = dynamicImport(() => import('@/features/parks/core/components/AppMap'), {
  loading: () => <div className="h-full w-full bg-[#f3f4f6]" />,
  ssr: false,
});

const BRAND_COLOR = '#00E5FF';
const GRAY_COLOR = '#6B7280';

// תכנית אימון לדוגמה (יוצג בדרואר אם אין תכנית ספציפית למסלול)
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

function MapPageContent() {
  const [mounted, setMounted] = React.useState(false);
  const logic = useMapLogic();
  const { status: runStatus } = useSessionStore();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-[100dvh] w-full bg-white" />;
  }

  return (
    <main className="relative h-[100dvh] w-full bg-[#f3f4f6] overflow-hidden font-sans" style={{ height: '100dvh' }}>
      {!logic.isWorkoutActive && <div className="absolute inset-0 z-[-1] pointer-events-none"><ParticleBackground /></div>}

      {/* --- המפה (THE MAP) --- */}
      <div className="absolute inset-0 z-0">
        <AppMap
          // מעביר רק את המסלולים הרלוונטיים
          routes={logic.isWorkoutActive ? (logic.focusedRoute ? [logic.focusedRoute] : []) : (logic.routesToDisplay || [])}
          
          // נתונים חיים
          currentLocation={logic.currentUserPos}
          userBearing={logic.userBearing}
          livePath={logic.isWorkoutActive ? logic.livePath : undefined}
          
          // מצבי מצלמה
          isActiveWorkout={logic.isWorkoutActive}
          isNavigationMode={logic.isNavigationMode}
          
          // אינטראקציה (קריטי כדי שתוכל לבחור מסלול ולהתחיל)
          onRouteSelect={logic.setSelectedRoute}
          selectedRoute={logic.selectedRoute}
        />
      </div>

      {/* --- ממשק ריצה פעיל: פרימיום FreeRun / Interval --- */}
      {logic.isWorkoutActive && logic.workoutStartTime && !logic.showSummary && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          {/* Premium running dashboard (dispatches to FreeRunView) */}
          <ActiveDashboard />
        </div>
      )}

      {/* --- ממשק רגיל (כשלא רצים) --- */}
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

              {/* Quick Access Buttons - Only show when search is focused */}
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

          <div className="absolute right-4 z-40 bottom-[350px]">
            <button onClick={logic.handleLocationClick} className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center bg-white pointer-events-auto active:scale-95 transition-all">
              <Navigation size={20} fill={logic.isFollowing ? BRAND_COLOR : "none"} color={logic.isFollowing ? BRAND_COLOR : GRAY_COLOR} />
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
          {logic.navState === 'idle' && !logic.isGenerating && !logic.isWorkoutActive && <BottomNavigation />}
        </>
      )}

      {/* MODALS & DRAWERS */}
      {logic.isGenerating && <RouteGenerationLoader />}
      {logic.showSummary && (
        <WorkoutSummaryPage
          onFinish={() => {
            logic.setShowSummary(false);
            logic.setShowDopamine(true); // Show dopamine screen after summary
          }}
          workoutType={logic.workoutMode === 'free' ? 'FREE_RUN' : 'PLAN_RUN'}
        />
      )}
      {logic.showDopamine && (
        <DopamineScreen
          onContinue={() => {
            logic.setShowDopamine(false);
            logic.setIsWorkoutActive(false);
            // Navigation to home happens in WorkoutSummaryPage
          }}
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
        onStart={() => {
          logic.setShowDetailsDrawer(false);
          logic.startActiveWorkout();
        }}
        plan={logic.showDetailsDrawer ? demoWorkoutPlan : null}
      />
    </main>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="h-[100dvh] w-full flex items-center justify-center bg-[#f3f4f6]">טוען...</div>}>
      <MapPageContent />
    </Suspense>
  );
}