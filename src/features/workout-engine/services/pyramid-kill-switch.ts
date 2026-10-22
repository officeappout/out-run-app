/**
 * Pyramid kill switch (panel flag `pyramid_injection_off`, card "פירמידות כבויות").
 *
 * Owner 22.10.2026: only the pyramid protocol is not accurate yet — supersets,
 * EMOM and tabata stay exactly as configured per program/level. When the switch
 * is ON the home generator never injects a pyramid:
 *   • 'pyramid' is dropped from the option's preferredProtocols (the lottery
 *     then rolls among what is left, or goes straight sets when nothing is),
 *   • the intense option's forced pyramid (Bolt-3) is skipped,
 *   • hybrid sessions built from the trio inherit both, so no pyramid steps.
 *
 * Pure helpers + one synchronous read, so the caller reads it ONCE per generation.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';

/** One read per generation — the device's last-known panel value (fail-closed: false). */
export function readPyramidInjectionOff(): boolean {
  return readLiveFlag('pyramidInjectionOff');
}

/** The protocol list without 'pyramid' (undefined stays undefined). */
export function withoutPyramid<T extends string>(protocols: readonly T[] | undefined): T[] | undefined {
  if (!protocols) return undefined;
  return protocols.filter((p) => p !== 'pyramid');
}

interface ProtocolContextLike {
  preferredProtocols?: readonly string[];
  protocolProbability?: number;
}

/**
 * Applies the switch to one generation context in place. When the list had only
 * 'pyramid', it becomes empty and the probability 0 — straight sets.
 */
export function applyPyramidKillSwitch<C extends ProtocolContextLike>(ctx: C, pyramidOff: boolean): C {
  if (!pyramidOff || !ctx.preferredProtocols?.includes('pyramid')) return ctx;
  const rest = withoutPyramid(ctx.preferredProtocols) ?? [];
  (ctx as ProtocolContextLike).preferredProtocols = rest;
  if (rest.length === 0) (ctx as ProtocolContextLike).protocolProbability = 0;
  console.log('[WorkoutTrio] ⛔ PYRAMID removed by system switch (pyramid_injection_off)');
  return ctx;
}
