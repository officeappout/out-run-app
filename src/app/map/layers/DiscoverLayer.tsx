'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useUserStore } from '@/features/user';
import { usePresenceLayer } from '@/features/safecity/hooks/usePresenceLayer';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import BottomJourneyContainer from '@/features/parks/core/components/BottomJourneyContainer';
import NavigationHub from '@/features/parks/core/components/NavigationHub';
import SafeCityOverlay from '@/features/safecity/components/SafeCityOverlay';
import LiveFriendMarker from '@/features/safecity/components/LiveFriendMarker';
import KudoSheet from '@/features/safecity/components/KudoSheet';
import ViralUnlockSheet from '@/features/safecity/components/ViralUnlockSheet';
import ChatDrawer from '@/features/parks/core/components/ChatDrawer';
import { WorkoutPreviewDrawer } from '@/features/workout-engine/players/strength';
import RouteGenerationLoader from '@/features/parks/core/components/RouteGenerationLoader';
import { WorkoutPlan, useMapLogic } from '@/features/parks';
import { seedMockLemurs, clearMockLemurs } from '@/features/safecity/services/presence.service';
import type { PresenceMarker } from '@/features/safecity/services/segregation.service';
import {
  Search, SlidersHorizontal, Navigation, Sparkles,
  Home, Briefcase, Bookmark, MapPin, X,
  Users, Globe, Bug, Lock, Route as RouteIcon,
} from 'lucide-react';
import { Check as CheckIcon } from 'lucide-react';

type MapLogic = ReturnType<typeof useMapLogic>;

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
  ],
};

interface DiscoverLayerProps {
  logic: MapLogic;
  flyoverComplete: boolean;
}

export default function DiscoverLayer({ logic, flyoverComplete }: DiscoverLayerProps) {
  const { setMode } = useMapMode();
  const presence = usePresenceLayer(logic.currentUserPos ?? null, flyoverComplete);
  const { profile, getSocialUnlocked } = useUserStore();
  const socialUnlocked = getSocialUnlocked();
  const { celebrate } = useGoalCelebration();

  const [kudoTarget, setKudoTarget] = useState<PresenceMarker | null>(null);
  const [viralSheetOpen, setViralSheetOpen] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const mockIdsRef = useRef<string[]>([]);
  const [hasMocks, setHasMocks] = useState(false);

  const handleKudoSent = useCallback(() => {
    celebrate('kudo_sent_' + Date.now(), 0);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([15, 30, 15]);
  }, [celebrate]);

  const handleSeedMock = useCallback(async () => {
    const pos = logic.currentUserPos;
    if (!pos) return;
    const level = profile?.progression?.lemurStage ?? 3;
    const ids = await seedMockLemurs(pos, level, 5);
    mockIdsRef.current = ids;
    setHasMocks(true);
  }, [logic.currentUserPos, profile?.progression?.lemurStage]);

  const handleClearMock = useCallback(async () => {
    if (mockIdsRef.current.length === 0) return;
    await clearMockLemurs(mockIdsRef.current);
    mockIdsRef.current = [];
    setHasMocks(false);
  }, []);

  const handleAddressSelect = async (addr: { text: string; coords: [number, number] }) => {
    await logic.handleAddressSelect(addr);
    setMode('navigate');
  };

  return (
    <>
      {/* ── SafeCity Presence Overlay ── */}
      <SafeCityOverlay
        markers={presence.markers}
        heatmapCount={presence.heatmap.length}
        privacyMode={presence.privacyMode}
        ageGroup={presence.myAgeGroup}
      />

      {/* ── Social Live Map Layer ── */}
      {!presence.isBlocked && (
        <>
          <div className="absolute top-20 left-4 z-30">
            <div className="flex bg-white/90 backdrop-blur-sm rounded-xl shadow-md border border-gray-100 overflow-hidden">
              <button
                onClick={() => {
                  if (!socialUnlocked) { setViralSheetOpen(true); return; }
                  presence.setSocialMode('friends');
                }}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold transition-colors ${
                  presence.socialMode === 'friends' && socialUnlocked ? 'bg-[#00BAF7] text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Users size={12} />
                <span>שותפים</span>
                {!socialUnlocked && !justUnlocked && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-sm border border-white">
                    <Lock size={8} className="text-white" strokeWidth={3} />
                  </span>
                )}
                {justUnlocked && (
                  <motion.span
                    initial={{ scale: 0 }} animate={{ scale: [0, 1.4, 1] }} transition={{ duration: 0.5 }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center shadow-md border-2 border-white"
                  >
                    <CheckIcon size={10} className="text-white" strokeWidth={3} />
                  </motion.span>
                )}
              </button>
              <button
                onClick={() => presence.setSocialMode('discover')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold transition-colors ${
                  presence.socialMode === 'discover' ? 'bg-[#00BAF7] text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Globe size={12} />
                <span>גלה</span>
              </button>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-[360px] left-0 right-0 z-[25] px-3 pointer-events-none"
          >
            {presence.markers.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide pointer-events-auto" dir="rtl">
                {presence.markers.map((m) => (
                  <div key={m.uid} className="flex-shrink-0">
                    <LiveFriendMarker marker={m} size={44} onClick={setKudoTarget} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-2 px-4 bg-white/80 backdrop-blur-sm rounded-xl shadow border border-cyan-100 pointer-events-auto" dir="rtl">
                <p className="text-[11px] text-gray-400 font-medium">
                  {presence.isLoading ? '⏳ מחפש אווטירים...' : presence.socialMode === 'friends' ? '👀 אף שותף לא פעיל כרגע' : '🌍 אין אווטירים בסביבה'}
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}

      {/* ── NavigationHub ── */}
      <NavigationHub
        navState={logic.navState}
        onStateChange={logic.setNavState}
        searchQuery={logic.searchQuery}
        onSearchChange={logic.setSearchQuery}
        suggestions={logic.suggestions}
        onAddressSelect={handleAddressSelect}
        navigationRoutes={logic.navigationRoutes}
        selectedActivity={logic.selectedNavActivity}
        onActivitySelect={(type) => { logic.setSelectedNavActivity(type); logic.setFocusedRoute(logic.navigationRoutes[type]); }}
        isLoading={logic.isGenerating}
        isSearching={logic.isSearching}
        onShuffle={logic.handleShuffle}
        onStart={logic.startActiveWorkout}
        inputRef={logic.searchInputRef}
      />

      {/* ── Top Search Bar + Filter + AI Coach ── */}
      <div className="absolute top-0 left-0 right-0 z-[70] pt-[max(1.5rem,env(safe-area-inset-top))] px-4 pointer-events-none transition-opacity">
        <div className="max-w-md mx-auto w-full pointer-events-auto flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setMode('builder')} className="h-12 w-12 rounded-2xl bg-white shadow-lg flex items-center justify-center border border-gray-100 text-gray-700 active:scale-95 transition-all">
              <SlidersHorizontal size={22} />
            </button>
            <div className="flex-1 relative">
              <div className="bg-white shadow-lg rounded-2xl h-12 flex items-center px-2 border border-gray-100 overflow-hidden">
                <div className="flex-1 flex items-center h-full">
                  <Search className="text-gray-400 ms-2 shrink-0" size={20} />
                  <input
                    ref={logic.searchInputRef}
                    type="text"
                    placeholder={logic.navState === 'idle' ? 'חיפוש מסלול...' : 'לאן רוצים להגיע?'}
                    value={logic.searchQuery}
                    onFocus={() => { if (logic.navState === 'idle') logic.setNavState('searching'); }}
                    onChange={(e) => logic.setSearchQuery(e.target.value)}
                    className="w-full h-full bg-transparent border-none outline-none text-sm text-gray-700 px-2 placeholder:text-gray-400 text-right font-bold"
                  />
                </div>
                {logic.navState !== 'idle' ? (
                  <button
                    onClick={() => { logic.setNavState('idle'); logic.setSearchQuery(''); if (logic.searchInputRef.current) logic.searchInputRef.current.blur(); }}
                    className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors me-2"
                  >
                    <X size={20} className="text-gray-400" />
                  </button>
                ) : (
                  <button
                    onClick={async () => { await logic.handleAICoachRequest(logic.searchQuery.trim() || 'תן לי מוטיבציה לאימון!'); }}
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
                      onClick={() => handleAddressSelect(s)}
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

          {logic.navState === 'searching' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }} className="flex gap-2" dir="rtl"
            >
              <button onClick={() => { logic.setSearchQuery('בית'); if (logic.searchInputRef.current) logic.searchInputRef.current.focus(); }}
                className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full shadow-sm border border-gray-100 text-gray-600 text-[11px] font-bold hover:bg-white transition-all active:scale-95">
                <Home size={14} className="text-cyan-500" /><span>בית</span>
              </button>
              <button onClick={() => { logic.setSearchQuery('עבודה'); if (logic.searchInputRef.current) logic.searchInputRef.current.focus(); }}
                className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full shadow-sm border border-gray-100 text-gray-600 text-[11px] font-bold hover:bg-white transition-all active:scale-95">
                <Briefcase size={14} className="text-purple-500" /><span>עבודה</span>
              </button>
              <button onClick={() => { logic.setSearchQuery('שמורים'); if (logic.searchInputRef.current) logic.searchInputRef.current.focus(); }}
                className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full shadow-sm border border-gray-100 text-gray-600 text-[11px] font-bold hover:bg-white transition-all active:scale-95">
                <Bookmark size={14} className="text-amber-500" /><span>שמורים</span>
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Right-side action buttons ── */}
      <div className="absolute right-4 z-40 bottom-[350px] flex flex-col gap-2">
        {/* FAB: Open Builder */}
        <button
          onClick={() => setMode('builder')}
          className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center bg-[#00E5FF] text-white pointer-events-auto active:scale-95 transition-all"
        >
          <RouteIcon size={22} />
        </button>
        <button onClick={logic.handleLocationClick} className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center bg-white pointer-events-auto active:scale-95 transition-all">
          <Navigation size={20} fill={logic.isFollowing ? BRAND_COLOR : 'none'} color={logic.isFollowing ? BRAND_COLOR : GRAY_COLOR} />
        </button>
        <button
          onClick={hasMocks ? handleClearMock : handleSeedMock}
          className={`w-12 h-12 rounded-full shadow-xl flex items-center justify-center pointer-events-auto active:scale-95 transition-all ${hasMocks ? 'bg-red-100 text-red-600' : 'bg-cyan-100 text-cyan-700'}`}
        >
          <Bug size={18} />
        </button>
      </div>

      {/* ── Bottom Journey Container ── */}
      {logic.navState === 'idle' && (
        <BottomJourneyContainer
          routes={logic.workoutMode === 'free' ? [] : (logic.routesToDisplay || [])}
          currentActivity={logic.preferences.activity}
          onActivityChange={logic.handleActivityChange}
          onShuffle={() => { logic.setRouteGenerationIndex((prev: number) => prev + 1); logic.setSmartPaths({}); }}
          onRouteFocus={(r) => { logic.setFocusedRoute(r); logic.setSelectedRoute(r); }}
          focusedRouteId={logic.focusedRoute?.id || null}
          workoutMode={logic.workoutMode}
          onModeChange={(wmode) => {
            logic.setWorkoutMode(wmode);
            if (wmode === 'free') {
              logic.setFocusedRoute(null);
              logic.setSelectedRoute(null);
              setMode('free_run');
            }
          }}
          loadingRouteIds={logic.loadingRouteIds}
          onShowDetails={() => logic.setShowDetailsDrawer(true)}
          onStartWorkout={logic.startActiveWorkout}
        />
      )}

      {/* ── Modals & Drawers ── */}
      {logic.isGenerating && <RouteGenerationLoader />}

      <ChatDrawer
        isOpen={logic.isChatOpen} onClose={() => logic.setIsChatOpen(false)}
        messages={logic.chatMessages} onSendMessage={logic.handleAICoachRequest} isLoading={logic.isAILoading}
      />

      <WorkoutPreviewDrawer
        isOpen={logic.showDetailsDrawer} onClose={() => logic.setShowDetailsDrawer(false)}
        workout={logic.showDetailsDrawer && demoWorkoutPlan ? {
          id: demoWorkoutPlan.id, title: demoWorkoutPlan.name,
          duration: typeof demoWorkoutPlan.totalDuration === 'number' ? demoWorkoutPlan.totalDuration : 45,
          difficulty: demoWorkoutPlan.difficulty,
          segments: demoWorkoutPlan.segments.map((seg) => ({
            id: seg.id, type: seg.type === 'station' ? 'strength' as const : 'running' as const,
            title: seg.title, repsOrDuration: seg.exercises?.[0]?.reps || seg.exercises?.[0]?.duration,
          })),
        } : null}
        onStartWorkout={() => { logic.setShowDetailsDrawer(false); logic.startActiveWorkout(); }}
      />

      <KudoSheet
        marker={kudoTarget} fromUid={profile?.id ?? ''} fromName={profile?.core?.name ?? ''}
        onClose={() => setKudoTarget(null)} onSent={handleKudoSent}
      />

      <ViralUnlockSheet isOpen={viralSheetOpen} onClose={() => setViralSheetOpen(false)} />
    </>
  );
}
