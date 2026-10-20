/**
 * Walking × the recommendation policy (#529). Pure.
 *  - the audience (older adults / athletes) the policy already derives from personas + age;
 *  - the optional light core add-on (display only, as the policy shows it today):
 *    the walk goal is fed in as the policy goal it means.
 */
import { buildPolicySignals, resolveAudience, resolveRecommendation } from '../recommendation-policy';
import type { PolicyAddOn } from '../recommendation-policy/types';
import type { WalkAudience, WalkGoal } from './walkPlan.types';

/** Walk goal → an id the policy's GOAL_ID_MAP already knows. */
const WALK_GOAL_POLICY_ID: Record<WalkGoal, string> = {
  weight_loss: 'weight_loss',
  belly: 'core',
  health: 'health',
  steps: 'routine',
};

export function walkAudience(personaIds: readonly string[], age: number | null): WalkAudience {
  return resolveAudience(personaIds, age);
}

export function walkAddOn(goal: WalkGoal, personaIds: readonly string[], age: number | null): PolicyAddOn | null {
  try {
    const rec = resolveRecommendation(
      buildPolicySignals({
        tracks: 'running',
        strengthLevel: null,
        run: null,
        goalIds: [WALK_GOAL_POLICY_ID[goal]],
        personaIds,
        age,
      }),
    );
    return rec.addOns.find((a) => a.kind === 'core') ?? null;
  } catch {
    return null;
  }
}
