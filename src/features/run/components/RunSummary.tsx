"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Map, { Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRunStore } from '../store/useRunStore';
import { Share2, Trophy, Clock, Zap, TrendingUp, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user/store/useUserStore';
import { calculateCalories } from '@/lib/calories.utils';
import { updateUserProgression } from '@/lib/firestore.service';
import { auth } from '@/lib/firebase';
import { saveWorkout } from '@/features/workout/services/WorkoutStorageService';

interface Props {
  onFinish: () => void;
}

export default function RunSummary({ onFinish }: Props) {
  const router = useRouter();
  const { totalDistance, totalDuration, currentPace, routeCoords, activityType, clearCurrentWorkout } = useRunStore();
  const { profile, updateProfile } = useUserStore();
  const [drawerPosition, setDrawerPosition] = useState('half');

  // Calculate calories and coins
  const userWeight = profile?.core?.weight || 70;
  // totalDuration is in seconds, calculateCalories expects minutes
  const calories = calculateCalories(activityType, Math.floor(totalDuration / 60), userWeight);
  // New Formula: 1 Coin per 1 Full Calorie
  const earnedCoins = Math.floor(calories);

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
      clearCurrentWorkout();
      onFinish();
      router.push('/home');
      return;
    }

    // 1. Data Reward: Update User Store and Firestore (EXISTING LOGIC)
    if (profile) {
      const currentCoins = profile.progression?.coins || 0;
      const currentCalories = profile.progression?.totalCaloriesBurned || 0;

      const newCoins = currentCoins + earnedCoins;
      const newTotalCalories = currentCalories + calories;

      // Update local store (Zustand)
      updateProfile({
        progression: {
          ...profile.progression,
          coins: newCoins,
          totalCaloriesBurned: newTotalCalories,
        }
      });

      // Sync to Firestore if user is authenticated
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          // Update user progression (coins & calories)
          await updateUserProgression(currentUser.uid, {
            coins: newCoins,
            totalCaloriesBurned: newTotalCalories,
          });
          console.log('✅ Coins and calories synced to Firestore');

          // ✅ Save workout to history
          await saveWorkout({
            userId: currentUser.uid,
            activityType: activityType || 'running',
            distance: totalDistance,
            duration: totalDuration,
            calories: calories,
            pace: currentPace || 0,
            routePath: routeCoords.length > 0 ? routeCoords as [number, number][] : undefined,
            earnedCoins: earnedCoins,
          });
          console.log('✅ Workout saved to history');
        } catch (error) {
          console.error('❌ Error syncing to Firestore:', error);
          // Continue anyway - local update succeeded
        }
      }
    }

    // 2. State Reset
    clearCurrentWorkout();

    // 3. Smart Navigation -> Home
    onFinish(); // Cleans up local state in page.tsx
    router.push('/home'); // Navigates to Home Tab
  };

  const handleClaim = () => {
    // Redirect to Onboarding with fixed bonus for Guest signup
    const queryParams = new URLSearchParams({
      claim: 'true',
      coins: '20', // Fixed bonus as requested
      calories: calories.toString() // Keep calories for record
    }).toString();

    router.push(`/onboarding?${queryParams}`);
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
          {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
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
        </div>

        {isGuest && (
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
              השלם פרופיל וקבל בונוס (+20 מטבעות)
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
    </div>
  );
}