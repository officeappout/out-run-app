'use client';

/**
 * Everything AiCoachChat needs from the flags and the AI entitlement, read ONE way for every
 * place that opens Kelly (the /ai-coach page, the week builder's "סדר לי במילים" overlay).
 * Real flag values (no super-admin override) — the server reads the same.
 */
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { isWeatherOnFor } from '@/features/weather/core/weather-access';
import { runsByTypeFor } from '@/features/schedule/utils/runsByTypeGate';
import { useAiCoachAccess } from './useAiCoachAccess';

export interface KellyChatConfig {
  loading: boolean;
  canUseAi: boolean;
  /** kelly_unified_v1. */
  unified: boolean;
  /** ai_coach_phase2: quick replies, hints, schedule proposal cards. */
  phase2: boolean;
  /** ai_coach_proactive: "איך היה?" answer chips. */
  proactive: boolean;
  /** ai_coach_memory: "מה קלי זוכר". */
  memory: boolean;
  /** ai_coach_round4: walk / run cards, nearby parks, tour + questionnaire chips. */
  round4: boolean;
  weatherOn: boolean;
  /** enable_home_v2 the way home reads it: program run by slot type. */
  runsByType: boolean;
}

export function useKellyChatConfig(): KellyChatConfig {
  const { profile } = useUserStore();
  const { canUseAi, loading } = useAiCoachAccess();
  const { flags, rawFlags, loading: flagsLoading } = useFeatureFlags();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- core.isSuperAdmin is not on the profile type
  const isSuperAdmin = !!(profile?.core as any)?.isSuperAdmin;
  return {
    loading: loading || flagsLoading,
    canUseAi,
    unified: flags.kellyUnifiedV1 === true,
    phase2: flags.aiCoachPhase2 === true,
    proactive: flags.aiCoachProactive === true,
    memory: flags.aiCoachMemory === true,
    round4: flags.aiCoachRound4 === true,
    weatherOn: isWeatherOnFor(rawFlags, isSuperAdmin),
    runsByType: runsByTypeFor(rawFlags, isSuperAdmin),
  };
}
