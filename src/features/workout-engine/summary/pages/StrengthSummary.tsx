'use client';

import StrengthSummaryPage, {
  type StrengthSummaryPageProps,
} from '@/features/workout-engine/components/strength/StrengthSummaryPage';

/**
 * StrengthSummary — Stage 2 composition page behind STRENGTH_SUMMARY_V2_ENABLED
 * (default false). It currently delegates to StrengthSummaryPage for EXACT
 * parity (its 6-hook orchestration stays intact), establishing the flag seam
 * safely; migrating its internals onto the summary/blocks kit is a focused
 * follow-up behind the same flag, device-parity-checked before any flip. Props
 * are the unchanged StrengthSummaryPageProps so the injection is a straight swap.
 */
export default function StrengthSummary(props: StrengthSummaryPageProps) {
  return <StrengthSummaryPage {...props} />;
}
