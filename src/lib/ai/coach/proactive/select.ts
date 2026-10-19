/**
 * Kelly phase 3 — pick at most ONE proactive message for a user in this run. Pure.
 *
 * Every trigger in priority order (TRIGGER_PRIORITY) answers from the state; the shared gate
 * (policy.ts) is applied to each one that wants to send. The first that passes both wins.
 * `explainAll` returns every trigger's verdict for the admin preview ("what would Kelly
 * send today and why").
 */
import { sharedGate } from './policy';
import { TRIGGERS } from './triggers';
import { TRIGGER_PRIORITY, type ProactiveTrigger, type ProactiveUserState, type TriggerDecision, type TriggerOptions } from './types';

export interface TriggerVerdict {
  trigger: ProactiveTrigger;
  decision: TriggerDecision;
  /** The shared gate's refusal, when the trigger itself wanted to send. */
  gate: string | null;
}

export function explainAll(s: ProactiveUserState, opts: TriggerOptions & { only?: readonly ProactiveTrigger[] } = {}): TriggerVerdict[] {
  const list = opts.only ? TRIGGER_PRIORITY.filter((t) => opts.only!.includes(t)) : TRIGGER_PRIORITY;
  return list.map((trigger) => {
    const decision = TRIGGERS[trigger](s, opts);
    return { trigger, decision, gate: decision.shouldSend ? sharedGate(s, trigger) : null };
  });
}

/** The message to send now, or null. */
export function selectProactive(
  s: ProactiveUserState,
  opts: TriggerOptions & { only?: readonly ProactiveTrigger[] } = {},
): Extract<TriggerDecision, { shouldSend: true }> | null {
  for (const v of explainAll(s, opts)) {
    if (v.decision.shouldSend && v.gate === null) return v.decision;
  }
  return null;
}
