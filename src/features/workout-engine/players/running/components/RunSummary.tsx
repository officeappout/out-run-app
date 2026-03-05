"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Map, { Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRunningPlayer } from '../store/useRunningPlayer';
import { useSessionStore } from '../../../core/store/useSessionStore';
import { Share2, Trophy, Clock, Zap, TrendingUp, LogOut, Shield } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useUserStore, useProgressionStore } from '@/features/user';
import { calculateCalories } from '@/lib/calories.utils';
import { updateUserProgression, syncFieldToFirestore } from '@/lib/firestore.service';
import { auth } from '@/lib/firebase';
import AccountSecureStep from '@/features/user/onboarding/components/steps/AccountSecureStep';
import { saveWorkout } from '../../../core/services/storage.service';
import { createWorkoutPost } from '@/features/social/services/feed.service';
import { extractFeedScope } from '@/features/social/services/feed-scope.utils';
import { detectNearbyPark } from '@/features/workout-engine/services/park-detection.service';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

interface Props {
  onFinish: () => void;
}

export default function RunSummary({ onFinish }: Props) {
  const router = useRouter();
  const { totalDistance, totalDuration } = useSessionStore();
  const { currentPace, routeCoords, activityType, clearRunningData } = useRunningPlayer();
  const { profile, updateProfile } = useUserStore();
  const [drawerPosition, setDrawerPosition] = useState('half');
  const [dateLabel, setDateLabel] = useState('');
  useEffect(() => {
    setDateLabel(new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }));
  }, []);

  // Calculate calories and coins
  const userWeight = profile?.core?.weight || 70;
  // totalDuration is in seconds, calculateCalories expects minutes
  const calories = calculateCalories(activityType, Math.floor(totalDuration / 60), userWeight);
  // COIN_SYSTEM_PAUSED: Re-enable in April
  // New Formula: 1 Coin per 1 Full Calorie
  const earnedCoins = IS_COIN_SYSTEM_ENABLED ? Math.floor(calories) : 0;

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Guest Logic detection
  const isGuest = profile?.id && !profile.core?.email;

  const handleFinish = async () => {
    if (isGuest) {
      // Basic Guest Finish:
      clearRunningData();
      useSessionStore.getState().clearSession();
      onFinish();
      router.push('/home');
      return;
    }

    // 1. WORKOUT-TO-PROGRESSION BRIDGE: Award coins and record activity
    // COIN_SYSTEM_PAUSED: awardWorkoutRewards already checks IS_COIN_SYSTEM_ENABLED
    const currentUser = auth.currentUser;
    if (currentUser && profile) {
      try {
        // Award workout rewards (coins + lemur evolution)
        await useProgressionStore.getState().awardWorkoutRewards(currentUser.uid, calories);
        
        console.log(
          IS_COIN_SYSTEM_ENABLED 
            ? `✅ [RunSummary] Awarded ${earnedCoins} coins and recorded activity`
            : `[RunSummary] COIN_SYSTEM_PAUSED - Recorded activity only (${calories} calories)`
        );
        
        // Legacy: Also update local profile for immediate UI update
        const currentCoins = profile.progression?.coins || 0;
        const currentCalories = profile.progression?.totalCaloriesBurned || 0;
        updateProfile({
          progression: {
            ...profile.progression,
            // COIN_SYSTEM_PAUSED: Don't increment coins when system is disabled
            coins: IS_COIN_SYSTEM_ENABLED ? currentCoins + earnedCoins : currentCoins,
            totalCaloriesBurned: currentCalories + calories,
          }
        });
      } catch (error) {
        console.error('[RunSummary] Error awarding workout rewards:', error);
      }
    }

    // 2. Save Workout History (EXISTING LOGIC)
    if (profile) {
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const currentCoins = profile.progression?.coins || 0;
          // COIN_SYSTEM_PAUSED: Don't increment coins when system is disabled
          const newCoins = IS_COIN_SYSTEM_ENABLED ? currentCoins + earnedCoins : currentCoins;
          const newTotalCalories = (profile.progression?.totalCaloriesBurned || 0) + calories;
          
          await updateUserProgression(currentUser.uid, {
            coins: newCoins,
            totalCaloriesBurned: newTotalCalories,
          });
          console.log(IS_COIN_SYSTEM_ENABLED 
            ? '✅ Coins and calories synced to Firestore'
            : '✅ COIN_SYSTEM_PAUSED - Calories only synced to Firestore'
          );

          // ✅ Save workout to history
          await saveWorkout({
            userId: currentUser.uid,
            activityType: activityType || 'running',
            distance: totalDistance,
            duration: totalDuration,
            calories: calories,
            pace: currentPace || 0,
            routePath: routeCoords.length > 0 ? routeCoords as [number, number][] : undefined,
            // COIN_SYSTEM_PAUSED: Record 0 coins when system is disabled
            earnedCoins: IS_COIN_SYSTEM_ENABLED ? earnedCoins : 0,
          });
          console.log('✅ Workout saved to history');

          // ✅ Publish to social feed (with scope fields for leaderboard)
          if (profile?.core?.name) {
            const durationMin = Math.max(1, Math.round(totalDuration / 60));
            const scope = extractFeedScope(profile);
            const lastCoord = routeCoords.length > 0 ? routeCoords[routeCoords.length - 1] : null;
            const parkPromise = lastCoord
              ? detectNearbyPark(lastCoord[1], lastCoord[0])
              : Promise.resolve(null);

            parkPromise.then((park) => {
              createWorkoutPost({
                authorUid: currentUser.uid,
                authorName: profile.core.name,
                activityCategory: 'cardio',
                durationMinutes: durationMin,
                distanceKm: totalDistance > 0 ? totalDistance : undefined,
                paceMinPerKm: currentPace > 0 ? currentPace : undefined,
                ...scope,
                parkId: park?.parkId,
                parkName: park?.parkName,
              }).catch((err) => console.warn('[RunSummary] Feed post failed:', err));
            }).catch(() => {});
          }
        } catch (error) {
          console.error('❌ Error syncing to Firestore:', error);
          // Continue anyway - local update succeeded
        }
      }
    }

    // 3. State Reset
    clearRunningData();
    useSessionStore.getState().clearSession();

    // 4. Smart Navigation -> Home
    onFinish(); // Cleans up local state in page.tsx
    router.push('/home'); // Navigates to Home Tab
  };

  // ── Post-Workout Email Capture Drawer ──
  const [showEmailDrawer, setShowEmailDrawer] = useState(false);
  const [showInlineAccount, setShowInlineAccount] = useState(false);

  const handleClaim = () => {
    setShowEmailDrawer(true);
  };

  const handleEmailCaptured = async (secured: boolean, method?: string, email?: string) => {
    if (secured && email) {
      await syncFieldToFirestore('core.email', email);
    }
    setShowInlineAccount(false);
    setShowEmailDrawer(false);
  };

  const dismissEmailDrawer = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dismissed_email_cta', 'true');
    }
    setShowEmailDrawer(false);
  };

  // Hydration check
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  if (!isMounted) return null;

  return (
    <div dir="rtl" className="fixed inset-0 z-[100] bg-black text-white flex flex-col h-[100dvh] font-sans animate-in slide-in-from-bottom duration-500">
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 pt-8 pb-32">
        <h1 className="text-5xl font-black italic mb-2 tracking-tighter leading-none text-transparent bg-clip-text bg-gradient-to-l from-white to-gray-400">
          האימון<br />הושלם!
        </h1>
        <p className="text-gray-400 mb-8 text-lg font-medium">
          {dateLabel}
        </p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Stats Cards */}
          <div className="bg-[#111] p-4 rounded-3xl border border-white/10">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">מרחק</span>
            <div className="text-4xl font-black mt-1 font-mono tracking-tight">{totalDistance.toFixed(2)}<span className="text-base text-gray-500 me-1 font-sans">ק"מ</span></div>
          </div>
          <div className="bg-[#111] p-4 rounded-3xl border border-white/10">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">קלוריות</span>
            <div className="text-4xl font-black mt-1 font-mono tracking-tight text-orange-500">{calories}<span className="text-base text-gray-500 me-1 font-sans">kcal</span></div>
          </div>
          {/* COIN_SYSTEM_PAUSED: Re-enable in April */}
          {IS_COIN_SYSTEM_ENABLED && (
            <div className="col-span-2 bg-[#1C1C1E] p-5 rounded-3xl border border-white/10 flex items-center justify-between shadow-2xl shadow-black/50">
              <div>
                <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">הרווחת</span>
                <div className="text-5xl font-black mt-1 font-mono text-[#00E5FF] drop-shadow-[0_0_15px_rgba(0,229,255,0.4)] flex items-baseline">
                  +{earnedCoins} <span className="text-sm text-gray-500 me-2 font-sans font-bold">מטבעות</span>
                </div>
              </div>
              {isGuest && (
                <span className="text-xs bg-gray-800/80 text-gray-400 px-3 py-1.5 rounded-full border border-gray-700 font-medium">מצב אורח (Guest)</span>
              )}
            </div>
          )}
        </div>

        {/* COIN_SYSTEM_PAUSED: Re-enable in April */}
        {IS_COIN_SYSTEM_ENABLED && isGuest && (
          <div className="mb-6 bg-gradient-to-l from-yellow-900/30 to-orange-900/30 border border-orange-500/30 rounded-3xl p-5 flex items-start gap-4 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-2xl shrink-0 border border-orange-500/20">🔒</div>
            <div>
              <h4 className="font-bold text-orange-100 text-lg leading-tight mb-1">התחברו ושמרו את המטבעות</h4>
              <p className="text-sm text-orange-200/70 leading-relaxed">
                צרו חשבון כדי לשמור את {earnedCoins} המטבעות שהרווחתם כעת ולעקוב אחר ההתקדמות שלכם לאורך זמן.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-6 pb-20 bg-gradient-to-t from-black via-black to-transparent z-[101]">
        {isGuest ? (
          <div className="flex gap-4">
            <button
              onClick={handleFinish}
              className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-white/10 transition-colors border border-white/5"
            >
              וותר
            </button>
            <button
              onClick={handleClaim}
              className="flex-[2] py-4 rounded-2xl font-black text-lg bg-[#00E5FF] text-black hover:bg-[#00D4EE] transition-all shadow-[0_0_25px_rgba(0,229,255,0.3)] hover:scale-[1.02] active:scale-95"
            >
              {/* COIN_SYSTEM_PAUSED: Re-enable in April */}
              {IS_COIN_SYSTEM_ENABLED ? 'השלם פרופיל וקבל בונוס (+20 מטבעות)' : 'השלם פרופיל'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleFinish}
            className="w-full py-4 rounded-xl font-bold bg-[#00E5FF] text-black hover:bg-[#00D4EE] transition-all shadow-[0_0_20px_rgba(0,229,255,0.3)]"
          >
            סיום וחזרה לבית
          </button>
        )}
      </div>

      {/* ── Post-Workout Email Capture Drawer ──────────────────────────── */}
      <AnimatePresence>
        {showEmailDrawer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60"
            onClick={dismissEmailDrawer}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-t-3xl shadow-2xl overflow-hidden"
              dir="rtl"
            >
              {showInlineAccount ? (
                <div className="p-2">
                  <AccountSecureStep
                    onNext={handleEmailCaptured}
                    onSkip={dismissEmailDrawer}
                  />
                </div>
              ) : (
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-black text-slate-900">גבה את האימון שלך</h3>
                      <p className="text-sm text-slate-500">הוסף אימייל כדי לא לאבד את ההתקדמות</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowInlineAccount(true)}
                    className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-xl shadow-md active:scale-[0.98] transition-all"
                  >
                    התחבר עם Google
                  </button>
                  <button
                    onClick={dismissEmailDrawer}
                    className="w-full mt-2 py-2.5 text-sm text-slate-500 hover:text-slate-700 font-medium"
                  >
                    אולי מאוחר יותר
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}