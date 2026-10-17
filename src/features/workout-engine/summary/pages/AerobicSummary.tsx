'use client';

import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import AerobicSummaryShell from '../components/aerobic/AerobicSummaryShell';
import type { FinishContinuation } from '../blocks/FinishAndContinueFooter';

export interface AerobicSummaryProps {
  variant: 'group' | 'solo' | 'pair';
  activityType: 'walking' | 'running';
  workout: WorkoutHistoryEntry & { date: Date };
  currentUid: string | undefined;
  streakDays: number;
  onSave: () => void;
  onClose: () => void;
  /** XP earned this session; pill hidden when 0 or undefined. */
  xpEarned?: number;
  /** History (read-only) mode — forwarded to AerobicSummaryShell. */
  isReadOnly?: boolean;
  /** History delete trigger — forwarded to AerobicSummaryShell. */
  onDelete?: () => void;
  /** Gap above the open drawer — forwarded to AerobicSummaryShell. */
  peekHeight?: number;
  /** G7.1 finish & continue footer — forwarded to AerobicSummaryShell. */
  continuation?: FinishContinuation;
}

/**
 * AerobicSummary — Stage 2 composition page behind AEROBIC_SUMMARY_V2_ENABLED
 * (default false). It currently delegates to AerobicSummaryShell for EXACT
 * parity, establishing the flag seam safely; the incremental migration of its
 * internals onto the summary/blocks kit lands behind the same flag, each step
 * device-parity-checked before any flip. Props mirror AerobicSummaryShell so
 * the injection in WorkoutSummaryPage is a straight swap.
 */
export default function AerobicSummary(props: AerobicSummaryProps) {
  return <AerobicSummaryShell {...props} />;
}
