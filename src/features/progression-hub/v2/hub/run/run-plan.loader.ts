/**
 * Running page — the plan's planned volume, phases and zones (one-shot, bounded).
 *
 * Reads: the program template (phases + progression rules, 1 doc), the pace-map
 * config (1 doc) and the plan's DISTINCT workout templates (≤ 40 docs — a plan
 * repeats a handful of templates). Each schedule entry is then materialized for
 * its week exactly like the player does (materializeWorkout) and its time /
 * distance estimated (estimateRunTotals). Nothing is written.
 */
import {
  getPaceMapConfig,
  getRunProgramTemplate,
  getRunWorkoutTemplate,
} from '@/features/workout-engine/core/services/running-admin.service';
import { computeZones, materializeWorkout } from '@/features/workout-engine/core/services/running-engine.service';
import { estimateRunTotals } from '@/features/workout-engine/players/running/utils/run-preview/run-estimates';
import { mainZone } from '@/features/workout-engine/players/running/utils/run-preview/run-zone-ladder';
import type {
  ActiveRunningProgram,
  ComputedPaceZone,
  PaceProfile,
  ProgressionRule,
  RunWorkoutTemplate,
  RunZoneType,
} from '@/features/workout-engine/core/types/running.types';
import type { PhaseName, PlanEntry } from './run-page.model';

const MAX_TEMPLATES = 40;

export interface RunPlanDetail {
  entries: PlanEntry[];
  phases: { name: PhaseName; startWeek: number; endWeek: number }[] | null;
  zones: Record<RunZoneType, ComputedPaceZone> | null;
  /** Main zone of the next session still to run (highlighted on the zone ladder). */
  nextZone: RunZoneType | null;
}

const templateIdOf = (workoutId: string) => workoutId.replace(/_w\d+$/, '');

export async function loadRunPlanDetail(program: ActiveRunningProgram, pace: PaceProfile | null | undefined): Promise<RunPlanDetail> {
  const schedule = Array.isArray(program.schedule) ? program.schedule : [];
  const ids = Array.from(new Set(schedule.map((s) => templateIdOf(s.workoutId)))).slice(0, MAX_TEMPLATES);
  const [programTpl, config, ...templates] = await Promise.all([
    getRunProgramTemplate(program.programId).catch(() => null),
    getPaceMapConfig().catch(() => null),
    ...ids.map((id) => getRunWorkoutTemplate(id).catch(() => null)),
  ]);
  const byId = new Map<string, RunWorkoutTemplate>();
  templates.forEach((tpl, i) => {
    if (tpl) byId.set(ids[i], tpl as RunWorkoutTemplate);
  });
  const phases = programTpl?.phases?.length ? programTpl.phases.map((p) => ({ name: p.name, startWeek: p.startWeek, endWeek: p.endWeek })) : null;
  const zones = pace && pace.basePace > 0 && config ? computeZones(pace.basePace, pace.profileType, config) : null;
  const ctx = { basePace: pace?.basePace ?? 0, zones };

  let nextZone: RunZoneType | null = null;
  const ordinals = new Map<number, number>();
  const entries: PlanEntry[] = [...schedule]
    .sort((a, b) => a.week - b.week || a.day - b.day)
    .map((s, idx) => {
      const ordinal = (ordinals.get(s.week) ?? 0) + 1;
      ordinals.set(s.week, ordinal);
      const tpl = byId.get(templateIdOf(s.workoutId));
      let plannedMin: number | null = null;
      let plannedKm: number | null = null;
      if (tpl && pace && config) {
        try {
          // Same rules the home's planned-run card passes to the player (usePlannedRunWorkout).
          const rules = ((programTpl as { progressionRules?: ProgressionRule[] } | null)?.progressionRules ?? []) as ProgressionRule[];
          const w = materializeWorkout(tpl, s.week, rules, pace, config);
          const totals = estimateRunTotals(w.blocks, ctx);
          plannedMin = totals.seconds != null ? Math.round(totals.seconds / 60) : null;
          plannedKm = totals.meters != null ? Math.round(totals.meters / 100) / 10 : null;
          if (!nextZone && s.status === 'pending') nextZone = mainZone(w.blocks);
        } catch {
          // A template the engine can't materialize → that session shows no estimate.
        }
      }
      return {
        key: `${s.week}-${s.day}-${idx}`,
        week: s.week,
        ordinal,
        name: s.workoutName ?? tpl?.name ?? null,
        category: s.category ?? null,
        status: s.status,
        plannedMin,
        plannedKm,
      };
    });
  return { entries, phases, zones, nextZone };
}
