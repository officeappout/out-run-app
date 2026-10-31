/**
 * Hidden Handstand Triad levels on the user's handstand track.
 *
 * Owner decision (31.10.2026): handstand stays ONE visible program. No child
 * programs like full body's push/pull/legs/core; the three axis levels are
 * internal sub-levels stored on the existing track:
 *   progression.tracks.handstand.triad = { strength, balance, mobility }
 * set by the level assessment / re-tests. The user sees one handstand level.
 *
 * They are NOT added as keys of userProgramLevels: many consumers treat every
 * key as a domain or take the max level (warm-up zone, intense injection,
 * protocol settings reads, coach cue text). Instead they ride alongside the
 * map instance in a WeakMap, and only resolveTriadLevels reads them. The map
 * object is passed by reference through the pipeline; if a caller copies it,
 * the copy has no triad attached and every axis falls back to the handstand
 * level (the safe side: nobody drops).
 */
import { resolveToSlug } from '../../services/program-hierarchy.utils';
import { TRIAD_AXES, TRIAD_MAX, TRIAD_MIN, type TriadAxis } from './triad.types';

const HANDSTAND = 'handstand';
const attached = new WeakMap<ReadonlyMap<string, number>, Partial<Record<TriadAxis, number>>>();

const asLevel = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(TRIAD_MAX, Math.max(TRIAD_MIN, Math.round(v))) : null;

/** Attach the handstand track's hidden axis levels to `levels` (flag on only). */
export function addTriadTrackLevels(
  levels: Map<string, number>,
  tracks: Record<string, unknown> | undefined,
  enabled: boolean,
): void {
  if (!enabled || !tracks) return;
  // A user may hold both a hash-id and a slug track: take the one that has a triad.
  const triad = Object.keys(tracks)
    .filter((k) => k === HANDSTAND || resolveToSlug(k) === HANDSTAND)
    .map((k) => (tracks[k] as { triad?: Record<string, unknown> } | undefined)?.triad)
    .find((t) => t && typeof t === 'object');
  if (!triad) return;
  const out: Partial<Record<TriadAxis, number>> = {};
  for (const axis of TRIAD_AXES) {
    const v = asLevel(triad[axis]);
    if (v !== null) out[axis] = v;
  }
  if (Object.keys(out).length > 0) attached.set(levels, out);
}

/** The hidden axis levels attached to this map, if any. */
export function getAttachedTriadLevels(
  levels: ReadonlyMap<string, number> | undefined,
): Partial<Record<TriadAxis, number>> | undefined {
  return levels ? attached.get(levels) : undefined;
}
