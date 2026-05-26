"use client";

/**
 * UserHeaderPill Component
 * 
 * Displays user avatar with coins and a dynamic flame icon
 * that changes based on daily activity status.
 * 
 * Flame States:
 * - 'super' (Full workout) → Blue/Cyan flame (#06B6D4) with glow
 * - 'micro' (Hit adaptive goal) → Orange flame (#F59E0B)
 * - 'none' → Gray/hidden flame
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useUserStore, useProgressionStore } from '@/features/user';
import { useDailyActivity } from '@/features/activity';
import { auth } from '@/lib/firebase';
import { onAuthStateChange } from '@/lib/auth.service';
import type { ActivityType } from '@/features/activity/types/activity.types';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import AnimatedFlame from '@/components/ui/AnimatedFlame';

// ============================================================================
// TYPES
// ============================================================================

interface UserHeaderPillProps {
  /** Custom className */
  className?: string;
  /** Show the avatar */
  showAvatar?: boolean;
  /** Show the flame icon */
  showFlame?: boolean;
  /** Compact mode (smaller sizing) */
  compact?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function UserHeaderPill({
  className = '',
  showAvatar = true,
  showFlame = true,
  compact = false,
}: UserHeaderPillProps) {
  const { profile } = useUserStore();
  const { coins, hydrateFromFirestore } = useProgressionStore();
  const { todayActivity, streak, isLoading: activityLoading } = useDailyActivity();
  
  const [isCoinsLoading, setIsCoinsLoading] = useState(true);
  const [previousActivityType, setPreviousActivityType] = useState<ActivityType | null>(null);
  const prevActivityRef = useRef<ActivityType>('none');
  
  // Current activity type from daily activity
  const activityType: ActivityType = todayActivity?.activityType ?? 'none';
  
  // Track activity type changes for animation
  useEffect(() => {
    if (activityType !== prevActivityRef.current) {
      setPreviousActivityType(prevActivityRef.current);
      prevActivityRef.current = activityType;
    }
  }, [activityType]);
  
  // Hydrate coins from Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      if (user && profile?.id) {
        setIsCoinsLoading(true);
        try {
          await hydrateFromFirestore(profile.id);
        } catch (error) {
          console.error('[UserHeaderPill] Error hydrating coins:', error);
        } finally {
          setIsCoinsLoading(false);
        }
      } else {
        setIsCoinsLoading(false);
      }
    });

    // Also hydrate immediately if user is already authenticated.
    // NOTE: hydrateFromFirestore is idempotent — if already hydrated it
    // returns immediately, so this is safe to call unconditionally.
    if (auth.currentUser && profile?.id) {
      setIsCoinsLoading(true);
      hydrateFromFirestore(profile.id)
        .catch((error) => {
          console.error('[UserHeaderPill] Error hydrating coins:', error);
        })
        .finally(() => {
          setIsCoinsLoading(false);
        });
    }

    return () => unsubscribe();
    // isHydrated intentionally omitted: including it caused an infinite
    // re-render loop (hydrate → isHydrated flips → effect re-runs → hydrate…).
    // The store's idempotency guard handles deduplication instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);
  
  // User avatar URL
  const avatarUrl = profile?.core?.photoURL;
  const userName = profile?.core?.name || 'U';
  const avatarInitial = userName.charAt(0).toUpperCase();
  
  const pillSize = compact ? 'px-2 py-0.5' : 'px-3 py-1.5';
  const avatarSize = compact ? 'w-6 h-6' : 'w-8 h-8';
  const textSize = compact ? 'text-xs' : 'text-sm';
  
  return (
    <div 
      className={`flex items-center gap-2 ${className}`}
      dir="rtl"
    >
      {/* Avatar */}
      {showAvatar && (
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`${avatarSize} rounded-full overflow-hidden border-2 border-white dark:border-slate-700 shadow-md`}
        >
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={userName} 
              className="w-full h-full object-cover" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-cyan-600 text-white font-bold">
              {avatarInitial}
            </div>
          )}
        </motion.div>
      )}
      
      {/* Coins Pill with Flame */}
      <motion.div 
        initial={{ x: -10, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className={`flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full ${pillSize} shadow-sm`}
      >
        {/* Dynamic Flame */}
        {showFlame && (
          <AnimatedFlame 
            activityType={activityType} 
            previousType={previousActivityType}
          />
        )}
        
        {/* Divider - only show if flame is shown AND coins are enabled */}
        {showFlame && IS_COIN_SYSTEM_ENABLED && (
          <div className="w-px h-4 bg-gray-200 dark:bg-slate-600" />
        )}
        
        {/* Coins - COIN_SYSTEM_PAUSED: Re-enable in April */}
        {IS_COIN_SYSTEM_ENABLED && (
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-full bg-yellow-400 border border-yellow-500 flex items-center justify-center text-[10px] text-yellow-900 font-bold shadow-sm">
              $
            </div>
            <span className={`${textSize} font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap`}>
              {isCoinsLoading || !isHydrated ? '...' : coins.toLocaleString()}
            </span>
          </div>
        )}
        
        {/* Streak Badge (if > 0) */}
        {streak > 0 && !activityLoading && (
          <>
            <div className="w-px h-4 bg-gray-200 dark:bg-slate-600" />
            <div className="flex items-center gap-0.5">
              <span className="text-orange-500 text-xs">🔥</span>
              <span className={`${textSize} font-bold text-orange-600 dark:text-orange-400`}>
                {streak}
              </span>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export { UserHeaderPill };
