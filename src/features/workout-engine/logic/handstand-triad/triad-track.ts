/**
 * Hidden Handstand Triad levels on the user's handstand track. Pure.
 *
 * Owner decision (31.10.2026): handstand stays ONE visible program. No child
 * programs like full body's push/pull/legs/core; the three axis levels are
 * internal sub-levels stored on the existing track:
 *   progression.tracks.handstand.triad = { strength, balance, mobility }
 * set by the level assessment / re-tests. The user sees one handstand level.
 *
 * `addTriadTrackLevels` copies them into the engine's userProgramLevels map
 * under internal keys (TRIAD_CHILD_KEYS) that resolveTriadLevels reads. Only
 * while the flag is on, so with the flag off the map is unchanged. A missing
 * axis is left absent → resolveTriadLevels falls back to the handstand level.
 */
import { resolveToSlug } from '../../services/program-hierarchy.utils';
import { TRIAD_CHILD_KEYS } from './triad-levels';
import { TRIAD_AXES, TRIAD_MAX, TRIAD_MIN } from './triad.types';

const HANDSTAND = 'handstand';

const asLevel = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(TRIAD_MAX, Math.max(TRIAD_MIN, Math.round(v))) : null;

export function addTriadTrackLevels(
  levels: Map<string, number>,
  tracks: Record<string, unknown> | undefined,
  enabled: boolean,
): void {
  if (!enabled || !tracks) return;
  const key = Object.keys(tracks).find((k) => k === HANDSTAND || resolveToSlug(k) === HANDSTAND);
  const triad = key ? (tracks[key] as { triad?: Record<string, unknown> } | undefined)?.triad : undefined;
  if (!triad) return;
  for (const axis of TRIAD_AXES) {
    const v = asLevel(triad[axis]);
    if (v !== null) levels.set(TRIAD_CHILD_KEYS[axis], v);
  }
}
