"use client";

import { useMemo } from 'react';
import type { UserFullProfile, DashboardMode } from '@/types/user-profile';
import type { OnboardingAnswer } from '@/types/onboarding-questionnaire';

/**
 * Decide which dashboard mode to show based on:
 * 1) Explicit override in user.lifestyle.dashboardMode
 * 2) Heuristics on onboarding answers (keywords)
 * 3) Fallback to DEFAULT
 */
export function useDashboardMode(user?: UserFullProfile | null): DashboardMode {
  return useMemo<DashboardMode>(() => {
    if (!user) return 'DEFAULT';

    // 1. Direct override from lifestyle
    if (user.lifestyle?.dashboardMode) {
      return user.lifestyle.dashboardMode;
    }

    // 2. Infer from onboarding answers if available
    // First, prefer explicit widgetTrigger set from the Admin Panel on the answer documents.
    // Then, fall back to legacy keyword-based heuristics for older users.
    const onboardingAnswers = (user as any)?.onboarding?.answers;
    if (onboardingAnswers) {
      try {
        // Normalize answers into an array, supporting both array and object map structures.
        const answersArray: OnboardingAnswer[] = Array.isArray(onboardingAnswers)
          ? onboardingAnswers
          : Object.values(onboardingAnswers as Record<string, OnboardingAnswer>);

        if (answersArray && answersArray.length > 0) {
          // 2a. New source of truth: widgetTrigger on answers
          const hasRunningTrigger = answersArray.some(
            (answer) => (answer as OnboardingAnswer).widgetTrigger === 'RUNNING',
          );
          if (hasRunningTrigger) {
            return 'RUNNING';
          }

          const hasPerformanceTrigger = answersArray.some(
            (answer) => (answer as OnboardingAnswer).widgetTrigger === 'PERFORMANCE',
          );
          if (hasPerformanceTrigger) {
            return 'PERFORMANCE';
          }
        }

        // 2b. Legacy fallback: text search on raw answers structure (for old users)
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
          return 'RUNNING';
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

    // 3. Default mode
    return 'DEFAULT';
  }, [user]);
}

