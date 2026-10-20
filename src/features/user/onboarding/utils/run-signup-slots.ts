/**
 * Run signup (enable_home_v2, journey 2) — which runs week 1 of the plan has,
 * read from the SAME template the running bridge builds at signup end
 * (bridgeRunningOnboarding → generateProgramTemplate) and trimmed to the
 * weekly frequency by the generator's own rule (resolveActiveSlots).
 * Nothing is invented here: the slot types are exactly what generatePlan
 * will fill for week 1.
 */
import { bridgeRunningOnboarding } from '../services/running-onboarding-bridge.service';
import { resolveActiveSlots } from '@/features/workout-engine/core/services/running-engine.service';
import { clampRunningFrequency } from '@/lib/running-frequency-bounds';
import type { RunSlot, TrainingLevel } from '@/features/schedule/engine-v2/types';

/** Week-1 run slots (priority order) for these answers at this weekly frequency. */
export function firstWeekRunSlots(answers: Record<string, unknown>, frequency: number): RunSlot[] {
  const freq = clampRunningFrequency(frequency);
  const { programTemplate } = bridgeRunningOnboarding({ ...answers, weeklyFrequency: freq });
  const phase = programTemplate.phases?.find((p) => p.startWeek <= 1 && 1 <= p.endWeek) ?? programTemplate.phases?.[0];
  if (!phase) return [];
  return resolveActiveSlots(phase.weekSlots, freq).map((s) => s.slotType as RunSlot);
}

/**
 * Engine level for a runner still in signup (no paceProfile yet) — the same
 * rule as weaverInput.resolveRunningLevel's onboarding fallback: the ability
 * tier 'none' / '5_15' (or a "start running" goal with no tier) is a
 * beginner; everyone else is intermediate.
 */
export function runLevelFromAnswers(answers: Record<string, unknown>): TrainingLevel {
  const tier = answers.abilityTier;
  if (tier === 'none' || tier === '5_15') return 'beginner';
  if (tier == null && (answers.goalPath ?? 'start_running') === 'start_running') return 'beginner';
  return 'intermediate';
}

/** The running questionnaire answers (sessionStorage, written by the dynamic flow + plan length). */
export function readRunningAnswers(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = sessionStorage.getItem('onboarding_running_answers');
    const parsed = stored ? JSON.parse(stored) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** '10k' etc. for the engine (defaults like the bridge: 5k). */
export function runTargetDistance(answers: Record<string, unknown>): string {
  return typeof answers.targetDistance === 'string' ? answers.targetDistance : '5k';
}
