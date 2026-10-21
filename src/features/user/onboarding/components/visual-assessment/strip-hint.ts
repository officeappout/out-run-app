/**
 * The strength quiz's drag hint (enable_strength_quiz_hint_v2, owner-approved design Q1–Q3,
 * 20.10.2026) — pure logic only: no React, no timers, no DOM. `useStripHint.ts` is the thin
 * glue that runs it; `StripDragHint.tsx` draws it.
 *
 * What the user gets (v2 coverflow strip only):
 *  - First category: the strip demos itself (harder by one tile, harder by one more, back to
 *    the start, ~9 s loop) with a finger riding each drag, a dark coach pill above it and the
 *    "קל"/"קשה" end labels. The demo's moves are NOT a choice — they never set userInteracted.
 *  - The first REAL interaction (a press on the strip, a scroll gesture on it, or the −/+
 *    stepper) stops the demo for good and turns the pill light ("now stop on the hardest");
 *    that line fades after AFTER_PILL_MS or on the next press.
 *  - Other categories: one short nudge of the strip (visual only), nothing else.
 *  - prefers-reduced-motion: no demo, no nudge — the pill and a static finger only.
 */

export type StripHintMode =
  /** Flag off / not the coverflow strip — the hint does nothing at all. */
  | 'off'
  /** First category: the self-demo + coach pill. */
  | 'demo'
  /** First category under prefers-reduced-motion: pill + static finger, no motion. */
  | 'static'
  /** Later categories: one short visual nudge. */
  | 'nudge'
  /** Later categories under prefers-reduced-motion: nothing. */
  | 'none';

export type CoachPill = 'intro' | 'after' | null;

export type NudgePhase = 'pending' | 'running' | 'done';

export interface StripHintState {
  mode: StripHintMode;
  /** The self-demo is driving the selection right now. */
  demoRunning: boolean;
  pill: CoachPill;
  nudge: NudgePhase;
  /** ms timestamp of the interaction that last changed the hint (debounces a double touch). */
  lastInteractionAt: number | null;
}

export interface StripHintInit {
  enabled: boolean;
  isFirstCategory: boolean;
  reducedMotion: boolean;
}

/**
 * A real interaction. `press` = a pointer press on the strip, or a −/+ stepper tap. `scroll` =
 * a scroll gesture with no press (a wheel / trackpad) — it can take over from the demo, but it
 * fires many times per gesture, so it never dismisses the "after" line on its own.
 */
export type InteractionKind = 'press' | 'scroll';

export type StripHintAction =
  | { type: 'reset'; init: StripHintInit }
  | { type: 'interact'; kind: InteractionKind; at: number }
  | { type: 'afterTimeout' }
  | { type: 'nudgeStart' }
  | { type: 'nudgeDone' };

// ── Timing (Q2's CSS keyframes: a 9 s loop) ─────────────────────────

export const DEMO_LOOP_MS = 9000;
/** Wait after the strip has positioned and its first thumbnails exist, before the first loop. */
export const DEMO_START_DELAY_MS = 500;
/** The finger appears this long before the tile starts moving under it. */
export const FINGER_LEAD_MS = 180;
/** Duration of one finger ride (fade in, drag, fade out). */
export const FINGER_RIDE_MS = 1100;

export interface DemoBeat {
  /** ms from the loop's start. */
  at: number;
  /** Tiles harder than the start (0 = back to the start). */
  offset: number;
  /** A finger rides this move (the two "harder" drags; the return has none). */
  finger: boolean;
}

/** Q2: hold, harder (14–26 %), hold, harder (42–54 %), hold, back (78–88 %), hold. */
export const DEMO_BEATS: readonly DemoBeat[] = [
  { at: 1260, offset: 1, finger: true },
  { at: 3780, offset: 2, finger: true },
  { at: 7020, offset: 0, finger: false },
];

export type DemoEvent =
  | { at: number; kind: 'finger' }
  | { at: number; kind: 'select'; index: number };

/**
 * One loop's events, in time order: a `finger` event (the finger starts its ride) FINGER_LEAD_MS
 * before each finger beat's `select` (the strip moves to that tile). `baseIndex` is where the
 * demo started (always the easiest tile on a fresh category); targets clamp to the last tile.
 */
export function buildDemoLoop(baseIndex: number, stepsLength: number): DemoEvent[] {
  const last = Math.max(0, stepsLength - 1);
  const events: DemoEvent[] = [];
  for (const beat of DEMO_BEATS) {
    const index = Math.min(baseIndex + beat.offset, last);
    if (beat.finger) {
      events.push({ at: beat.at, kind: 'finger' });
      events.push({ at: beat.at + FINGER_LEAD_MS, kind: 'select', index });
    } else {
      events.push({ at: beat.at, kind: 'select', index });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

/** Later categories: the nudge starts this long after mount and lasts NUDGE_MS. */
export const NUDGE_DELAY_MS = 600;
export const NUDGE_MS = 1200;
/** ~One tile (CoverflowStrip's CELL_SIZE), toward harder (harder is on the left). */
export const NUDGE_PX = 92;

/** The light "after" line fades on its own after this long. */
export const AFTER_PILL_MS = 4000;
/** A second press this soon after the one that switched the line is the same touch — ignored. */
export const INTERACTION_DEBOUNCE_MS = 700;

// ── Reducer ─────────────────────────────────────────────────────────

export function initStripHint({ enabled, isFirstCategory, reducedMotion }: StripHintInit): StripHintState {
  const base: StripHintState = { mode: 'off', demoRunning: false, pill: null, nudge: 'done', lastInteractionAt: null };
  if (!enabled) return base;
  if (isFirstCategory) {
    return reducedMotion
      ? { ...base, mode: 'static', pill: 'intro' }
      : { ...base, mode: 'demo', demoRunning: true, pill: 'intro' };
  }
  return reducedMotion ? { ...base, mode: 'none' } : { ...base, mode: 'nudge', nudge: 'pending' };
}

export function stripHintReducer(state: StripHintState, action: StripHintAction): StripHintState {
  switch (action.type) {
    case 'reset':
      return initStripHint(action.init);

    case 'interact': {
      if (state.mode === 'off') return state;
      // The first real interaction: the demo stops for good, the line turns light.
      if (state.pill === 'intro') {
        return { ...state, demoRunning: false, pill: 'after', nudge: 'done', lastInteractionAt: action.at };
      }
      if (state.pill === 'after') {
        if (action.kind !== 'press') return state;
        const last = state.lastInteractionAt;
        if (last !== null && action.at - last < INTERACTION_DEBOUNCE_MS) return state;
        return { ...state, pill: null, lastInteractionAt: action.at };
      }
      // No pill (later categories): an interaction only cancels a nudge that hasn't run yet.
      if (state.nudge === 'pending' || state.demoRunning) {
        return { ...state, demoRunning: false, nudge: state.nudge === 'pending' ? 'done' : state.nudge };
      }
      return state;
    }

    case 'afterTimeout':
      return state.pill === 'after' ? { ...state, pill: null } : state;

    case 'nudgeStart':
      return state.nudge === 'pending' ? { ...state, nudge: 'running' } : state;

    case 'nudgeDone':
      return state.nudge === 'running' ? { ...state, nudge: 'done' } : state;

    default:
      return state;
  }
}

// ── CTA during the demo ─────────────────────────────────────────────

export type CtaOutcome =
  | { confirm: true }
  /** Nothing is saved: stop the demo (as a first real interaction) and snap back to `snapTo`. */
  | { confirm: false; snapTo: number };

/**
 * A CTA tap while the demo still drives the selection must never confirm — the label shows a
 * tile the user never chose. It stops the demo for good, snaps back to where the demo started
 * and switches to the "after" line (dispatch an `interact` press); the NEXT tap confirms.
 */
export function ctaPressOutcome(demoRunning: boolean, baseIndex: number): CtaOutcome {
  return demoRunning ? { confirm: false, snapTo: baseIndex } : { confirm: true };
}

// ── Derived view ────────────────────────────────────────────────────

export interface StripHintView {
  pill: CoachPill;
  /** "קל" / "קשה" above the strip ends — while a coach line is showing. */
  showEndLabels: boolean;
  /** The demo's finger rides (only while the demo runs). */
  showDemoFinger: boolean;
  /** Reduced motion: a still finger on the selected tile, while the intro line shows. */
  showStaticFinger: boolean;
  nudgeActive: boolean;
}

export function stripHintView(state: StripHintState): StripHintView {
  return {
    pill: state.pill,
    showEndLabels: state.pill !== null,
    showDemoFinger: state.mode === 'demo' && state.demoRunning,
    showStaticFinger: state.mode === 'static' && state.pill === 'intro',
    nudgeActive: state.nudge === 'running',
  };
}

// ── Copy (male / female, same pattern as VisualSlider's isFemale) ──
// The text lives in src/messages/he/onboarding.json (quiz.hint.*); StripDragHint renders these
// keys with its isFemale as the ICU `gender`.

export type CoachCopyKey =
  | 'quiz.hint.intro.title'
  | 'quiz.hint.intro.sub'
  | 'quiz.hint.after.title'
  | 'quiz.hint.after.sub';

export interface CoachCopy {
  title: CoachCopyKey;
  sub: CoachCopyKey;
}

export function coachCopy(pill: Exclude<CoachPill, null>): CoachCopy {
  if (pill === 'intro') {
    return { title: 'quiz.hint.intro.title', sub: 'quiz.hint.intro.sub' };
  }
  return { title: 'quiz.hint.after.title', sub: 'quiz.hint.after.sub' };
}
