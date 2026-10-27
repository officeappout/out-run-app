"use client";

/**
 * LoadAdvisorBanner
 *
 * Displays a smart coaching recommendation when muscle imbalances are detected.
 * Uses the "Sentence Bank" pattern — a set of predefined Hebrew messages
 * triggered by volume ratios from the Weekly Volume Store.
 *
 * Rules:
 * - Push sets > 1.5× Pull sets → "Focus on Pull"
 * - Pull sets > 1.5× Push sets → "Focus on Push"
 * - SA sets near weekly cap → "SA limit approaching"
 * - Weekly budget > 90% used → "Recovery recommended"
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, TrendingUp, Shield, Zap } from 'lucide-react';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

// ============================================================================
// SENTENCE BANK
// ============================================================================

interface Advice {
  id: string;
  icon: React.ReactNode;
  /** Catalog key (src/messages/he/home.json), translated at render. */
  messageKey: 'loadAdvisor.budgetHigh' | 'loadAdvisor.pushDominant' | 'loadAdvisor.pullDominant' | 'loadAdvisor.onTrack';
  severity: 'info' | 'warning' | 'success';
}

/**
 * Derive coaching advice from current weekly volume state.
 */
function deriveAdvice(state: {
  totalSetsCompleted: number;
  weeklyBudget: number;
  sessionLogs: Array<{ programId?: string; setsCompleted: number }>;
}): Advice | null {
  const { totalSetsCompleted, weeklyBudget, sessionLogs } = state;

  // 1. Budget exhaustion check (>90%)
  if (weeklyBudget > 0 && totalSetsCompleted / weeklyBudget > 0.9) {
    return {
      id: 'budget-high',
      icon: <Shield className="w-4 h-4" />,
      messageKey: 'loadAdvisor.budgetHigh',
      severity: 'warning',
    };
  }

  // 2. Push/Pull imbalance detection
  // Aggregate sets by movement pattern from session logs
  const patternSets: Record<string, number> = {};
  for (const log of sessionLogs) {
    const pid = log.programId?.toLowerCase() || '';
    if (['push', 'chest', 'shoulder', 'triceps'].some(k => pid.includes(k))) {
      patternSets['push'] = (patternSets['push'] || 0) + log.setsCompleted;
    } else if (['pull', 'back', 'bicep', 'row'].some(k => pid.includes(k))) {
      patternSets['pull'] = (patternSets['pull'] || 0) + log.setsCompleted;
    }
  }

  const pushSets = patternSets['push'] || 0;
  const pullSets = patternSets['pull'] || 0;

  if (pushSets > 0 && pullSets > 0) {
    if (pushSets > pullSets * 1.5) {
      return {
        id: 'push-dominant',
        icon: <TrendingUp className="w-4 h-4" />,
        messageKey: 'loadAdvisor.pushDominant',
        severity: 'info',
      };
    }
    if (pullSets > pushSets * 1.5) {
      return {
        id: 'pull-dominant',
        icon: <TrendingUp className="w-4 h-4" />,
        messageKey: 'loadAdvisor.pullDominant',
        severity: 'info',
      };
    }
  }

  // 3. Good balance — positive reinforcement (only if meaningful volume)
  if (totalSetsCompleted >= 10 && weeklyBudget > 0 && totalSetsCompleted / weeklyBudget > 0.5) {
    return {
      id: 'on-track',
      icon: <Zap className="w-4 h-4" />,
      messageKey: 'loadAdvisor.onTrack',
      severity: 'success',
    };
  }

  return null;
}

// ============================================================================
// COMPONENT
// ============================================================================

const SEVERITY_STYLES: Record<string, string> = {
  info: 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800 text-cyan-800 dark:text-cyan-200',
  warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
  success: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
};

export function LoadAdvisorBanner({ className = '' }: { className?: string }) {
  const t = useT(home);
  const strength = useWeeklyVolumeStore((s) => s.strength);
  const sessionLogs = useWeeklyVolumeStore((s) => s.sessionLogs);

  const advice = useMemo(
    () =>
      deriveAdvice({
        totalSetsCompleted: strength.totalSetsCompleted,
        weeklyBudget: strength.weeklyBudget,
        sessionLogs: sessionLogs.map((l) => ({
          programId: l.programId,
          setsCompleted: l.setsCompleted,
        })),
      }),
    [strength.totalSetsCompleted, strength.weeklyBudget, sessionLogs],
  );

  return (
    <AnimatePresence>
      {advice && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className={`overflow-hidden ${className}`}
        >
          <div
            className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm font-medium ${SEVERITY_STYLES[advice.severity]}`}
            dir="rtl"
          >
            <span className="flex-shrink-0">{advice.icon}</span>
            <p className="flex-1 leading-relaxed">{t(advice.messageKey)}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default LoadAdvisorBanner;
