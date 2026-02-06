"use client";

import React, { useEffect, useState } from 'react';
import { useUserStore } from '../../identity/store/useUserStore';
import { getUserProgression } from '@/lib/firestore.service';
import { auth } from '@/lib/firebase';
import { onAuthStateChange } from '@/lib/auth.service';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

export default function CoinPill() {
  // COIN_SYSTEM_PAUSED: Re-enable in April
  if (!IS_COIN_SYSTEM_ENABLED) {
    return null;
  }
  const { profile, updateProfile } = useUserStore();
  const [coins, setCoins] = useState(profile?.progression?.coins || 0);
  const [isLoading, setIsLoading] = useState(false);

  // Sync coins from Firestore when user is authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      if (user) {
        setIsLoading(true);
        try {
          const progression = await getUserProgression(user.uid);
          if (progression) {
            setCoins(progression.coins);
            // Update local store to keep in sync
            if (profile) {
              updateProfile({
                progression: {
                  ...profile.progression,
                  coins: progression.coins,
                  totalCaloriesBurned: progression.totalCaloriesBurned,
                }
              });
            }
          }
        } catch (error) {
          console.error('Error loading coins from Firestore:', error);
          // Fallback to local store
          setCoins(profile?.progression?.coins || 0);
        } finally {
          setIsLoading(false);
        }
      } else {
        // Not authenticated - use local store
        setCoins(profile?.progression?.coins || 0);
      }
    });

    return () => unsubscribe();
  }, [profile, updateProfile]);

  // Also update when local profile changes (fallback)
  useEffect(() => {
    if (profile?.progression?.coins !== undefined) {
      setCoins(profile.progression.coins);
    }
  }, [profile?.progression?.coins]);

  return (
    <div className="flex items-center bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-full px-2.5 py-1 shadow-sm">
      <span className="text-xs font-bold text-yellow-700 dark:text-yellow-400 whitespace-nowrap">
        {isLoading ? '...' : `+${coins.toLocaleString()} מטבעות`}
      </span>
      <div className="w-4 h-4 rounded-full bg-yellow-400 border border-yellow-500 flex items-center justify-center text-[10px] text-yellow-900 font-bold mr-1.5 shadow-sm">
        $
      </div>
    </div>
  );
}
