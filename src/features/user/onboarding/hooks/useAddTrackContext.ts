'use client';

/**
 * The add-track engine input for the signed-in user (enable_home_v2, J3 / J4). Waits for
 * the program id ↔ slug map (raw Firestore program ids in the template must read as
 * strength, never as running ids), then reads only what the user already gave:
 *   J3 (added running): the strength days in the template; the new run plan's week-1 slots
 *       from this signup's answers at the recommended frequency (never asked again).
 *   J4 (added strength): the plan's run days; the new program × the WHO minimum (2).
 */
import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { ensureIdSlugMapWarm, resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { resolveDefaultRunningSchedule } from '@/lib/running-schedule-defaults';
import { WHO_STRENGTH_TARGET_DAYS } from '@/lib/who-strength-target';
import {
  firstWeekRunSlots,
  readRunningAnswers,
  runLevelFromAnswers,
  runTargetDistance,
} from '../utils/run-signup-slots';
import { classifyStrengthId, isStrengthTemplateId } from '@/features/schedule/engine/strengthVocabulary';
import { resolveRunningLevel, type WeaverInputProfile } from '@/features/schedule/engine/weaverInput';
import {
  activeStrengthProgramIds,
  existingRunDays,
  existingStrengthDays,
  knownTimes,
  slugOfStrengthId,
  type AddedTrack,
  type AddTrackTimesProfile,
} from '@/features/schedule/add-track/addTrackProfile';
import type { AddTrackInput } from '@/features/schedule/add-track/addTrackWeek';

export interface AddTrackContext {
  input: AddTrackInput;
  /** Stored strength ids per existing strength day. */
  existingStrengthIds: Partial<Record<number, string[]>>;
  /** Ids a NEW strength day gets (J4). */
  newStrengthIds: string[];
  times: { run: string; strength: string };
  isStrengthId: (id: string) => boolean;
}

const isStrengthId = (id: string) => isStrengthTemplateId(id, resolveToSlug);

export function buildAddTrackContext(added: AddedTrack, profile: WeaverInputProfile & AddTrackTimesProfile, now: Date): AddTrackContext {
  const existingStrength = existingStrengthDays(profile, resolveToSlug, added === 'running');
  const existingStrengthIds: Partial<Record<number, string[]>> = {};
  for (const d of existingStrength) existingStrengthIds[d.dow] = d.ids;

  if (added === 'running') {
    const answers = readRunningAnswers();
    let slots: AddTrackInput['newRunSlots'] = [];
    try {
      slots = firstWeekRunSlots(answers, resolveDefaultRunningSchedule(profile).frequency);
    } catch {
      slots = [];
    }
    return {
      input: {
        added,
        existingStrength,
        existingRuns: [],
        newRunSlots: slots,
        runLevel: runLevelFromAnswers(answers),
        targetDistance: runTargetDistance(answers),
      },
      existingStrengthIds,
      newStrengthIds: [],
      times: knownTimes(profile),
      isStrengthId,
    };
  }

  const programIds = activeStrengthProgramIds(profile, resolveToSlug);
  const slug = programIds.length ? slugOfStrengthId(programIds[0], resolveToSlug) : 'full_body';
  const fallbackId = classifyStrengthId(slug).scheduleId ?? 'FULL_BODY';
  return {
    input: {
      added,
      existingStrength,
      existingRuns: existingRunDays(profile, now),
      newStrength: { slug, sessionsPerWeek: Math.max(0, WHO_STRENGTH_TARGET_DAYS - existingStrength.length) },
      runLevel: resolveRunningLevel(profile.running),
      targetDistance: profile.running?.generatedProgramTemplate?.targetDistance ?? '5k',
    },
    existingStrengthIds,
    newStrengthIds: programIds.length ? [programIds[0]] : [fallbackId],
    times: knownTimes(profile),
    isStrengthId,
  };
}

/** null while the profile / slug map load. */
export function useAddTrackContext(added: AddedTrack): AddTrackContext | null {
  const profile = useUserStore((s) => s.profile);
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    let alive = true;
    ensureIdSlugMapWarm()
      .catch(() => undefined)
      .finally(() => alive && setWarm(true));
    return () => {
      alive = false;
    };
  }, []);
  const now = useMemo(() => new Date(), []);
  return useMemo(() => {
    if (!warm || !profile) return null;
    try {
      return buildAddTrackContext(added, profile as unknown as WeaverInputProfile & AddTrackTimesProfile, now);
    } catch (err) {
      console.error('[AddTrack] could not read the existing week', err);
      return null;
    }
  }, [warm, profile, added, now]);
}
