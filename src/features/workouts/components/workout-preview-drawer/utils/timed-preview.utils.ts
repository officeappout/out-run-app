/**
 * timed-preview.utils — the preview drawer of a workout with a timed block
 * (enable_home_v2; boards A-1a, A-2a, A-4a, A-5a). Pure.
 *
 * Reads the SAME decision the plan mapper turns into segments
 * (protocols/timed.block for AMRAP / EMOM, `tabataBlock` for tabata), so the
 * drawer can never show a format the player will not run. Produces the props
 * of the shared WorkoutOverviewHeader / JourneyStrip / ProfileStrip and the
 * block section's lines.
 */
import type { GeneratedWorkout, WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/workout-generator.types';
import { timedMainBlock, type TimedMainBlock } from '@/features/workout-engine/logic/protocols/timed.block';
import { timedJourneyItem, timedProfileStrip, toProfileStripSegments } from '@/features/workout-engine/engines/preview-strips';
import type { TimedBlockSpec, TimedItem } from '@/features/workout-engine/engines/timed/timed.types';
import type { JourneyStripItem } from '@/components/ui/v2/journey-strip';
import type { ProfileStripSegment } from '@/components/ui/v2/ProfileStrip';
import { exDisplayName } from './section-grouping.utils';

type Gw = Pick<GeneratedWorkout, 'structure' | 'blastMode' | 'exercises' | 'tabataBlock' | 'estimatedDuration'>;

export interface PreviewTimedModel {
  /** AMRAP / EMOM main block (null = classic main). */
  main: TimedMainBlock | null;
  mainSpec: TimedBlockSpec | null;
  tabataSpec: TimedBlockSpec | null;
}

const roleOf = (e: EngineWorkoutExercise) => e.exerciseRole ?? 'main';
const isTabata = (e: EngineWorkoutExercise) => e.protocolBlock === 'tabata';

/** An engine exercise as a timed item (target = its planned reps / seconds). */
export function engineTimedItem(e: EngineWorkoutExercise): TimedItem {
  const target = e.reps > 0 ? e.reps : undefined;
  return {
    kind: 'exercise',
    key: e.exercise.id,
    exerciseId: e.exercise.id,
    name: exDisplayName(e),
    ...(e.isTimeBased ? { targetHoldSec: target } : { targetReps: target }),
    ...(e.exercise.symmetry === 'unilateral' ? { isUnilateral: true } : {}),
  };
}

/** Null when the workout has no timed block at all (the drawer stays as today). */
export function previewTimedModel(gw: Gw): PreviewTimedModel | null {
  const main = timedMainBlock(gw);
  const mainEx = gw.exercises.filter((e) => roleOf(e) === 'main' && !isTabata(e));
  const tabEx = gw.exercises.filter(isTabata);
  const mainSpec: TimedBlockSpec | null = !main
    ? null
    : main.protocol === 'emom'
      ? { format: 'emom', config: main.config, items: mainEx.map(engineTimedItem) }
      : { format: 'amrap', config: main.config, items: mainEx.map(engineTimedItem) };
  const tabataSpec: TimedBlockSpec | null =
    gw.tabataBlock && tabEx.length > 0 ? { format: 'tabata', config: gw.tabataBlock.config, items: tabEx.map(engineTimedItem) } : null;
  if (!mainSpec && !tabataSpec) return null;
  return { main, mainSpec, tabataSpec };
}

/** Rough seconds of a classic part: ~45 s per planned set (work + rest). */
function partSec(list: readonly EngineWorkoutExercise[]): number {
  return list.reduce((a, e) => a + (e.sets > 0 ? e.sets : 1), 0) * 45;
}

interface Part {
  key: string;
  kind: 'bookend' | 'classic' | 'timed';
  sec: number;
  spec?: TimedBlockSpec;
}

function parts(gw: Gw, m: PreviewTimedModel): Part[] {
  const warm = gw.exercises.filter((e) => roleOf(e) === 'warmup');
  const cool = gw.exercises.filter((e) => roleOf(e) === 'cooldown');
  const main = gw.exercises.filter((e) => roleOf(e) === 'main' && !isTabata(e));
  const out: Part[] = [];
  if (warm.length) out.push({ key: 'warmup', kind: 'bookend', sec: partSec(warm) });
  if (m.mainSpec) out.push({ key: 'main', kind: 'timed', sec: 0, spec: m.mainSpec });
  else if (main.length) out.push({ key: 'main', kind: 'classic', sec: partSec(main) });
  if (m.tabataSpec) out.push({ key: 'tabata', kind: 'timed', sec: 0, spec: m.tabataSpec });
  if (cool.length) out.push({ key: 'cooldown', kind: 'bookend', sec: partSec(cool) });
  return out;
}

/** JourneyStrip: warm-up → block / classic main → tabata → cool-down. */
export function previewJourney(gw: Gw, m: PreviewTimedModel): JourneyStripItem[] {
  return parts(gw, m).map((p): JourneyStripItem =>
    p.spec ? timedJourneyItem(p.spec, p.key) : { key: p.key, kind: 'strength', seconds: Math.max(60, p.sec) },
  );
}

/** ProfileStrip: bookends low, a classic main moderate, a block by its own profile. */
export function previewProfile(gw: Gw, m: PreviewTimedModel): ProfileStripSegment[] {
  return parts(gw, m).flatMap((p) => {
    if (p.spec) {
      // A block's own segments are relative (flex = minutes) — keep them in minutes.
      return timedProfileStrip(p.spec).map((s) => ({ ...s, key: `${p.key}-${s.key}` }));
    }
    return toProfileStripSegments([
      { key: p.key, kind: 'station', durationSec: p.sec, share: 0, level: p.kind === 'bookend' ? 'low' : 'moderate', colorKey: 'strength' },
    ]);
  });
}

/** "14 דק׳ · 9 תרגילים · מסיים ~9:55". */
export function previewMeta(gw: Gw, now: Date): Array<{ key: string; text: string }> {
  const min = Math.max(1, Math.round(gw.estimatedDuration || 0));
  const end = new Date(now.getTime() + min * 60_000);
  const hhmm = `${end.getHours()}:${String(end.getMinutes()).padStart(2, '0')}`;
  const n = gw.exercises.length;
  return [
    { key: 'dur', text: `${min} דק׳` },
    { key: 'count', text: `${n} ${n === 1 ? 'תרגיל' : 'תרגילים'}` },
    { key: 'end', text: `מסיים ~${hhmm}` },
  ];
}

/** Block section header: format name, length pill, the format's one-line rule. */
export function blockHeaderModel(spec: TimedBlockSpec): { name: string; pill: string; line: string; tone: 'amrap' | 'emom' | 'tabata' } {
  if (spec.format === 'amrap') return { name: 'AMRAP', pill: `${Math.round(spec.config.capSec / 60)}′`, line: 'כמה שיותר סבבים', tone: 'amrap' };
  if (spec.format === 'emom') {
    const n = spec.items.length;
    const every = spec.config.intervalSec === 60 ? 'כל דקה' : `כל ${spec.config.intervalSec} שנ׳`;
    return { name: 'EMOM', pill: `${spec.config.totalIntervals}′`, line: `${every} · ${n} ${n === 1 ? 'תרגיל' : 'תרגילים'}`, tone: 'emom' };
  }
  return { name: 'טבטה', pill: `${spec.config.workSec}/${spec.config.restSec}`, line: `${spec.config.rounds} אינטרוולים`, tone: 'tabata' };
}

/** Card line of a block member: "12 חזרות · בכל סבב" / "דקות אי-זוגיות · 12 חזרות". */
export function blockItemLine(spec: TimedBlockSpec, index: number): string {
  const it = spec.items[index];
  if (!it) return '';
  const uni = it.isUnilateral ? ' לכל צד' : '';
  const target = it.targetReps ? `${it.targetReps} חזרות${uni}` : it.targetHoldSec ? `${it.targetHoldSec} שנ׳${uni}` : '';
  if (spec.format === 'amrap') return target ? `${target} · בכל סבב` : 'בכל סבב';
  if (spec.format === 'emom') {
    const n = spec.items.length;
    const which = n === 2 ? (index === 0 ? 'דקות אי-זוגיות' : 'דקות זוגיות') : n > 2 ? `כל ${n} דקות` : 'כל דקה';
    return target ? `${which} · ${target}` : which;
  }
  return `${spec.config.workSec} שנ׳${uni}`;
}
