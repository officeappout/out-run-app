"use client";

import { useMemo } from 'react';
import type { UserFullProfile, DashboardMode, PrimaryTrack } from '@/types/user-profile';
import type { OnboardingAnswer } from '@/types/onboarding-questionnaire';

/**
 * Map PrimaryTrack → DashboardMode (must stay in sync with track-mapper.service.ts)
 */
const TRACK_TO_MODE: Record<PrimaryTrack, DashboardMode> = {
  health: 'DEFAULT',
  strength: 'PERFORMANCE',
  run: 'RUNNING',
  hybrid: 'HYBRID',
};

/**
 * Decide which dashboard mode to show.
 *
 * Resolution priority:
 * 1) Explicit override in user.lifestyle.dashboardMode (coach/admin can force)
 * 2) Persona Engine: user.lifestyle.primaryTrack → deterministic mapping
 * 3) Legacy heuristics: onboarding answer keywords (for pre-Persona users)
 * 4) Fallback to DEFAULT
 *
 * @param user            The full user profile.
 * @param enableRunningMode  When false (flag off), clamps RUNNING/HYBRID → DEFAULT.
 *                          Super Admins pass true to bypass this clamp.
 */
export function useDashboardMode(
  user?: UserFullProfile | null,
  enableRunningMode = true,
): DashboardMode {
  return useMemo<DashboardMode>(() => {
    if (!user) return 'DEFAULT';

    // 1. Direct override from lifestyle (coach / admin can force a mode)
    if (user.lifestyle?.dashboardMode) {
      const resolved = user.lifestyle.dashboardMode;
      if (!enableRunningMode && (resolved === 'RUNNING' || resolved === 'HYBRID')) {
        return 'DEFAULT';
      }
      return resolved;
    }

    // 2. Persona Engine: primaryTrack → deterministic dashboard mode
    if (user.lifestyle?.primaryTrack) {
      const resolved = TRACK_TO_MODE[user.lifestyle.primaryTrack];
      if (!enableRunningMode && (resolved === 'RUNNING' || resolved === 'HYBRID')) {
        return 'DEFAULT';
      }
      return resolved;
    }

    // 3. Legacy: infer from onboarding answers for users who onboarded before Persona Engine
    const onboardingAnswers = (user as any)?.onboarding?.answers;
    if (onboardingAnswers) {
      try {
        // Normalize answers into an array, supporting both array and object map structures.
        const answersArray: OnboardingAnswer[] = Array.isArray(onboardingAnswers)
          ? onboardingAnswers
          : Object.values(onboardingAnswers as Record<string, OnboardingAnswer>);

        if (answersArray && answersArray.length > 0) {
          // 3a. widgetTrigger on answers (admin-tagged)
          const hasRunningTrigger = answersArray.some(
            (answer) => (answer as OnboardingAnswer).widgetTrigger === 'RUNNING',
          );
          if (hasRunningTrigger) {
            return enableRunningMode ? 'RUNNING' : 'DEFAULT';
          }

          const hasPerformanceTrigger = answersArray.some(
            (answer) => (answer as OnboardingAnswer).widgetTrigger === 'PERFORMANCE',
          );
          if (hasPerformanceTrigger) {
            return 'PERFORMANCE';
          }
        }

        // 3b. Legacy fallback: text search on raw answers structure (for old users)
        const text = JSON.stringify(onboardingAnswers).toLowerCase();

        // RUNNING-related keywords
        const runningKeywords = [
          'run',
          'running',
          'marathon',
          'cardio',
          '5k',
          '10k',
          'half marathon',
          'full marathon',
          'ריצה',
          'מרתון',
        ];

        if (runningKeywords.some((k) => text.includes(k.toLowerCase()))) {
          return enableRunningMode ? 'RUNNING' : 'DEFAULT';
        }

        // PERFORMANCE / strength-related keywords
        const performanceKeywords = [
          'muscle',
          'strength',
          'hypertrophy',
          'powerlifting',
          'weightlifting',
          'weights',
          'bulk',
          'gain muscle',
          'שריר',
          'שרירים',
          'כוח',
          'היפרטרופיה',
        ];

        if (performanceKeywords.some((k) => text.includes(k.toLowerCase()))) {
          return 'PERFORMANCE';
        }
      } catch (e) {
        console.warn('[useDashboardMode] Failed to analyze onboarding answers', e);
      }
    }

    // 4. Default mode
    return 'DEFAULT';
  }, [user, enableRunningMode]);
}
