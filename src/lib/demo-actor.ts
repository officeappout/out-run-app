/**
 * Demo actor sandbox — API-route side (B1 of agent-briefs/ai-testers-design.md §2.5,
 * owner-approved 20.10.2026). Pure, no Firebase import.
 *
 * A DEMO ACTOR is a signed-in caller whose uid starts with `demo_` OR whose token carries
 * the custom claim `demo: true` (the AI testers sign in as `demo_qa_*` with that claim).
 * firestore.rules' isDemoActor() is the same test. Routes that write with the Admin SDK on
 * the caller's behalf bypass the rules, so each one checks here: a demo actor may only
 * reach demo targets (`demo_` users / `demo-` groups, cities, units, orgs). For every
 * real caller these return "allowed" without reading anything — real users are unaffected.
 */
import { isDemoTenantId, isDemoUid } from './demo';

/** Shape of a verified ID token we need (firebase-admin DecodedIdToken satisfies it). */
export interface ActorClaims {
  uid: string;
  demo?: unknown;
}

export const DEMO_ACTOR_TARGET_ERROR = 'demo-actor-target';

export function isDemoActorClaims(claims: ActorClaims | null | undefined): boolean {
  if (!claims) return false;
  return isDemoUid(claims.uid) || claims.demo === true;
}

/** A demo-world id: a `demo_` user (or a doc id prefixed by one) or a `demo-` group / city / unit / org. */
export function isDemoWorldId(id: unknown): boolean {
  return isDemoUid(id) || isDemoTenantId(id);
}

/**
 * True when the write must be refused: the actor is demo and at least one target is not
 * a demo-world id (a missing / empty target counts as NOT demo — fail closed).
 * Always false for a real actor.
 */
export function demoActorTargetBlocked(actorIsDemo: boolean, targets: readonly unknown[]): boolean {
  if (!actorIsDemo) return false;
  if (targets.length === 0) return true;
  return targets.some((t) => !isDemoWorldId(t));
}

/** Id for a group a demo actor creates server-side (keeps it inside the demo world). */
export function demoScopedId(actorIsDemo: boolean, generatedId: string, kind: string): string {
  return actorIsDemo ? `demo-${kind}-${generatedId}` : generatedId;
}
