/**
 * preview-strips — plan → the props of the shared preview components (pure):
 *   JourneyStrip   (order of the session: run → station → run / a timed block)
 *   ProfileStrip   (effort per block: width = duration, height = intensity)
 * Both read the same plan; the intensity numbers come from intensity-profile.
 */
import type { JourneyStripItem } from '@/components/ui/v2/journey-strip';
import type { ProfileStripSegment } from '@/components/ui/v2/ProfileStrip';
import type { HybridPlannedSegment } from '../hybrid/compose-hybrid-session.service';
import { STRIP_COLORS } from './strip-item';
import { hybridIntensityProfile, timedIntensityProfile, type IntensityColorKey, type IntensityLevel, type IntensitySegment } from './intensity-profile';
import type { TimedBlockSpec } from './timed/timed.types';

/** Bar height (% of the strip) per level. */
export const PROFILE_HEIGHT: Record<IntensityLevel, number> = { rest: 15, low: 40, moderate: 65, high: 95 };
export const PROFILE_COLORS: Record<IntensityColorKey, string> = { cardio: STRIP_COLORS.cardio, strength: STRIP_COLORS.strength, rest: '#cbd5e1' };

export function toProfileStripSegments(segs: readonly IntensitySegment[]): ProfileStripSegment[] {
  return segs.map((s) => ({ key: s.key, color: PROFILE_COLORS[s.colorKey], flex: s.durationSec / 60, height: PROFILE_HEIGHT[s.level] }));
}

export function hybridProfileStrip(plan: readonly HybridPlannedSegment[], opts?: { transitionSec?: number }): ProfileStripSegment[] {
  return toProfileStripSegments(hybridIntensityProfile(plan, opts));
}

export function timedProfileStrip(spec: TimedBlockSpec): ProfileStripSegment[] {
  return toProfileStripSegments(timedIntensityProfile(spec));
}

/** Hybrid plan → JourneyStrip items (seconds formatted as minutes by the strip). */
export function hybridJourneyItems(plan: readonly HybridPlannedSegment[]): JourneyStripItem[] {
  return plan.map((seg, i): JourneyStripItem => {
    if (seg.kind === 'strength') {
      const sec = seg.durationSec ?? seg.content?.estimatedDurationSec;
      return { key: `st-${i}`, kind: 'strength', ...(seg.domainFocus ? { subtype: String(seg.domainFocus) } : {}), ...(sec ? { seconds: sec } : {}) };
    }
    const label = !seg.durationSec && seg.distanceKm ? `${seg.distanceKm} ק״מ` : undefined;
    return {
      key: `leg-${i}`,
      kind: 'aerobic',
      subtype: seg.aerobicType ?? 'running',
      ...(seg.durationSec ? { seconds: seg.durationSec } : {}),
      ...(label ? { label } : {}),
    };
  });
}

const FORMAT_LABEL: Record<TimedBlockSpec['format'], string> = { tabata: 'טבטה', emom: 'EMOM', amrap: 'AMRAP' };

/** Timed block → one JourneyStrip item ("AMRAP 10′"); a block with a run in the round shows as a repeat. */
export function timedJourneyItem(spec: TimedBlockSpec, key = spec.format): JourneyStripItem {
  const sec =
    spec.format === 'amrap'
      ? spec.config.capSec
      : spec.format === 'emom'
        ? spec.config.intervalSec * spec.config.totalIntervals
        : timedIntensityProfile(spec).reduce((a, s) => a + s.durationSec, 0);
  const label = `${FORMAT_LABEL[spec.format]} ${Math.max(1, Math.round(sec / 60))}′`;
  const hasRun = spec.items.some((it) => it.kind === 'aerobic_leg');
  return hasRun ? { key, kind: 'repeat', subtype: 'running', label } : { key, kind: 'strength', label };
}
