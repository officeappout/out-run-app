/**
 * hybrid-v2-view — labels and card data of the home-v2 hybrid player (pure).
 * Boards U-D1..U-D4, F-2b/F-2c, F-3b. No live pace on legs under 400 m
 * (the sequencer's `leg.showPace`), no emoji.
 */
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';
import type { SequencerView } from '../../engines/hybrid/sequencer.selectors';
import { isShortLegTarget } from '../../engines/leg-pace';
import { STRIP_COLORS } from '../../engines/strip-item';
import { fmtClock, fmtDistance } from '../../players/running/lib/planned-rep-results';
import { zoneTypeLabel, type ZoneTarget } from '../../players/running/lib/continuous-run';
import { aerobicKindLabel } from '../aerobic-kind';

export const HYBRID_V2_COLORS = { run: STRIP_COLORS.cardio, strength: STRIP_COLORS.strength } as const;

/** Display name of a planned exercise (injected: localized name / media live outside this pure file). */
export type ExerciseNameOf = (exercise: unknown) => string;

export type ContentExercise = { exercise?: unknown; method?: unknown; sets?: number; reps?: number; repsRange?: { min: number; max: number }; isTimeBased?: boolean };

export function stationExercises(seg: HybridPlannedSegment | null | undefined): ContentExercise[] {
  return ((seg?.content?.exercises ?? []) as unknown as ContentExercise[]).filter((e) => e && typeof e === 'object');
}

const walking = (seg: HybridPlannedSegment | null | undefined) => seg?.aerobicType === 'walking';
const cycling = (seg: HybridPlannedSegment | null | undefined) => seg?.aerobicType === 'cycling';
/** "הליכה" / "ריצה" / "רכיבה" for a leg (no aerobicType → "ריצה", as before). */
const verbOf = (seg: HybridPlannedSegment | null | undefined) => aerobicKindLabel(seg?.aerobicType);

/** "פארק הירקון" from the composed station names, else null. */
export function stationName(seg: HybridPlannedSegment | null | undefined, names: Record<string, string>): string | null {
  return (seg?.parkId && names[seg.parkId]) || null;
}

/** Index of the station right after plan[i], or -1. */
function stationAfterIndex(plan: readonly HybridPlannedSegment[], i: number): number {
  return plan[i + 1]?.kind === 'strength' ? i + 1 : -1;
}

function stationBefore(plan: readonly HybridPlannedSegment[], i: number): boolean {
  return plan.slice(0, i).some((s) => s.kind === 'strength');
}

/** Row / header label of plan[i]. */
export function legLabel(plan: readonly HybridPlannedSegment[], i: number, names: Record<string, string>): string {
  const seg = plan[i];
  if (!seg) return '';
  if (seg.kind === 'strength') return stationName(seg, names) ? `תחנת כוח · ${stationName(seg, names)}` : 'תחנת כוח';
  const verb = verbOf(seg);
  const next = stationAfterIndex(plan, i);
  if (next >= 0) {
    const name = stationName(plan[next], names);
    return name ? `${verb} אל ${name}` : `${verb} אל התחנה`;
  }
  if (stationBefore(plan, i) && !plan.slice(i + 1).some((s) => s.kind === 'strength')) return walking(seg) ? 'הליכת שחרור' : cycling(seg) ? 'רכיבת שחרור' : 'ריצת שחרור';
  return verb;
}

/** "2.4 ק״מ" / "10 דק׳" — the planned size of a leg. */
export function legTargetText(seg: HybridPlannedSegment | null | undefined): string {
  if (!seg) return '';
  if (seg.distanceKm && seg.distanceKm > 0) return fmtDistance(seg.distanceKm * 1000);
  if (seg.durationSec && seg.durationSec > 0) return `${Math.max(1, Math.round(seg.durationSec / 60))} דק׳`;
  return '';
}

/** The pace band of a leg for the run card, or null (no band, or a leg under 400 m). */
export function legZone(seg: HybridPlannedSegment | null | undefined): ZoneTarget | null {
  const band = seg?.targetPaceSecPerKm;
  if (!seg || !band || !(band.min > 0) || !(band.max > 0)) return null;
  if (isShortLegTarget({ distanceM: seg.distanceKm ? seg.distanceKm * 1000 : null, durationSec: seg.durationSec ?? null })) return null;
  return {
    minSec: Math.min(band.min, band.max),
    maxSec: Math.max(band.min, band.max),
    label: cycling(seg) ? 'רכיבה' : zoneTypeLabel(seg.zone) ?? (walking(seg) ? 'הליכה' : 'ריצה קלה'),
    showNumbers: true,
  };
}

export interface HybridHeaderView {
  eyebrow: string;
  title: string;
  color: string;
}

/** Header card: "ריצה + כוח" · "ריצה אל פארק הירקון · 650 מ׳ · 1 מתוך 3". */
export function headerView(
  view: SequencerView,
  plan: readonly HybridPlannedSegment[],
  names: Record<string, string>,
  /** The session's own name (route + stops: "מסלול + עצירות"); omitted → "הליכה/ריצה + כוח". */
  sessionLabel?: string | null,
): HybridHeaderView {
  const firstLeg = plan.find((s) => s.kind === 'aerobic');
  const eyebrow = sessionLabel || `${verbOf(firstLeg)} + כוח`;
  const of = `${Math.min(plan.length, view.cursor + 1)} מתוך ${plan.length}`;
  if (view.phase === 'transition') {
    return { eyebrow, title: `מעבר לכוח · ${of}`, color: HYBRID_V2_COLORS.strength };
  }
  if (view.phase === 'station') {
    return { eyebrow, title: `${legLabel(plan, view.cursor, names)} · ${of}`, color: HYBRID_V2_COLORS.strength };
  }
  if (view.phase === 'done') return { eyebrow, title: 'האימון הסתיים', color: HYBRID_V2_COLORS.run };
  const label = view.phase === 'idle' ? legLabel(plan, 0, names) : legLabel(plan, view.cursor, names);
  const toGo =
    view.distanceToStationM != null
      ? fmtDistance(view.distanceToStationM)
      : view.leg?.remainingM != null && view.leg.remainingM > 0
        ? fmtDistance(view.leg.remainingM)
        : view.leg?.remainingSec != null && view.leg.remainingSec > 0
          ? fmtClock(view.leg.remainingSec)
          : null;
  return { eyebrow, title: [label, toGo, of].filter(Boolean).join(' · '), color: HYBRID_V2_COLORS.run };
}

export interface NextBlockView {
  label: string;
  meta: string;
  color: string;
}

/** The run card's "הבא" strip: the station the leg leads to. */
export function nextBlockView(view: SequencerView, names: Record<string, string>): NextBlockView | null {
  const st = view.upcomingStation;
  if (!st) return null;
  const n = stationExercises(st).length;
  const min = Math.round((st.durationSec ?? st.content?.estimatedDurationSec ?? 0) / 60);
  const name = stationName(st, names);
  return {
    label: name ? `בלוק כוח · ${name}` : 'בלוק כוח',
    meta: [n > 0 ? `${n} תרגילים` : '', min > 0 ? `${min}′` : ''].filter(Boolean).join(' · '),
    color: HYBRID_V2_COLORS.strength,
  };
}

export interface TransitionView {
  /** "0:20". */
  countdown: string;
  /** 0–1 of the countdown left (ring). */
  fraction: number;
  stationLabel: string;
  /** "4 תרגילים · 12 סטים · 18 דק׳". */
  stationMeta: string;
  first: { name: string; target: string; setsText: string } | null;
  moreText: string | null;
}

/** "6–8 חזרות" / "30 שנ׳". */
export function repsText(e: ContentExercise): string {
  const unit = e.isTimeBased ? 'שנ׳' : 'חזרות';
  if (e.repsRange && e.repsRange.max > 0 && e.repsRange.max !== e.repsRange.min) return `${e.repsRange.min}–${e.repsRange.max} ${unit}`;
  return e.reps && e.reps > 0 ? `${e.reps} ${unit}` : '';
}

/** Transition card (F-2c / U-D2): countdown, the station and its first exercise. */
export function transitionView(
  view: SequencerView,
  plan: readonly HybridPlannedSegment[],
  names: Record<string, string>,
  nameOf: ExerciseNameOf,
  transitionSec: number,
): TransitionView {
  const seg = plan[view.cursor];
  const ms = Math.max(0, view.transitionRemainingMs ?? 0);
  const list = stationExercises(seg);
  const sets = seg?.content?.totalPlannedSets ?? list.reduce((a, e) => a + (e.sets ?? 0), 0);
  const min = Math.round((seg?.durationSec ?? seg?.content?.estimatedDurationSec ?? 0) / 60);
  const first = list[0];
  return {
    countdown: fmtClock(Math.ceil(ms / 1000)),
    fraction: transitionSec > 0 ? Math.min(1, ms / (transitionSec * 1000)) : 0,
    stationLabel: legLabel(plan, view.cursor, names),
    stationMeta: [list.length ? `${list.length} תרגילים` : '', sets ? `${sets} סטים` : '', min ? `${min} דק׳` : ''].filter(Boolean).join(' · '),
    first: first
      ? { name: nameOf(first.exercise), target: repsText(first), setsText: first.sets ? `סט 1 מתוך ${first.sets}` : '' }
      : null,
    moreText: list.length > 1 ? `עוד ${list.length - 1} תרגילים` : null,
  };
}

/** Mini-player lines. */
export function miniView(view: SequencerView, plan: readonly HybridPlannedSegment[], names: Record<string, string>, totalSec: number, totalKm: number) {
  const label = view.phase === 'transition' ? 'מעבר לכוח' : legLabel(plan, view.cursor, names);
  const extra = view.phase === 'transition' && view.transitionRemainingMs != null ? fmtClock(Math.ceil(view.transitionRemainingMs / 1000)) : null;
  return {
    color: view.phase === 'transition' || view.phase === 'station' ? HYBRID_V2_COLORS.strength : HYBRID_V2_COLORS.run,
    title: extra ? `${label} · ${extra}` : label,
    subtitle: `${fmtClock(totalSec)} · ${totalKm.toFixed(2)} ק״מ`,
  };
}
