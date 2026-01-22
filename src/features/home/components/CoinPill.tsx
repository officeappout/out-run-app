"use client";

import React, { useEffect, useState } from 'react';
import { useUserStore, useProgressionStore } from '@/features/user';
import { auth } from '@/lib/firebase';
import { onAuthStateChange } from '@/lib/auth.service';

export default function CoinPill() {
  const { profile } = useUserStore();
  const { coins, isHydrated, hydrateFromFirestore } = useProgressionStore();
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from Firestore on mount and auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      if (user && profile?.id) {
        setIsLoading(true);
        try {
          await hydrateFromFirestore(profile.id);
        } catch (error) {
          console.error('[CoinPill] Error hydrating coins:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    });

    // Also hydrate immediately if user is already authenticated
    if (auth.currentUser && profile?.id && !isHydrated) {
      setIsLoading(true);
      hydrateFromFirestore(profile.id)
        .catch((error) => {
          console.error('[CoinPill] Error hydrating coins:', error);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }

    return () => unsubscribe();
  }, [profile?.id, isHydrated, hydrateFromFirestore]);

  // Don't show 0 before hydration to prevent UI jumping
  if (!isHydrated && isLoading) {
    return (
      <div className="flex items-center bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-full px-2.5 py-1 shadow-sm">
        <span className="text-xs font-bold text-yellow-700 dark:text-yellow-400 whitespace-nowrap">
          ...
        </span>
        <div className="w-4 h-4 rounded-full bg-yellow-400 border border-yellow-500 flex items-center justify-center text-[10px] text-yellow-900 font-bold mr-1.5 shadow-sm">
          $
        </div>
      </div>
    );
  }

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
