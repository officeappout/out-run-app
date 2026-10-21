/**
 * Week builder (enable_week_builder_v1, owner 21.10.2026, boards S-2c…S-2g) — public shapes.
 *
 * A week the builder renders and edits: seven days (0 = Sunday), each with its sessions in
 * day order, a time of day and the engine's one-line "why". Pure data: no React, no Firebase.
 * Hosts (signup strength / run / walk, add-track, later the home schedule manager) turn their
 * engine-v2 output into a WbWeek with an adapter and turn the edited week back into their own
 * write payload. `P` is the host's own per-session data, carried through every move untouched.
 */
import type { RunSlot, TimeWindow, TrainingLevel } from '../engine-v2/types';

export type WbTrack = 'strength' | 'run' | 'walk';

export interface WbSession<P = unknown> {
  /** Stable across moves (the drag key). */
  id: string;
  track: WbTrack;
  /** Engine slug of a strength session — the day focus when the split steers it (upper_body, legs …). */
  slug?: string;
  /** Run slot (the engine places runs by type). */
  slot?: RunSlot;
  /** Long walk (the walk plan's one long walk). */
  long?: boolean;
  /** Card title: "עליון", "ריצת איכות", "שבוע 1 · ריצה-הליכה", "הליכה מהירה". */
  titleHe: string;
  /** Second line: "כוח עליון · 35 דק׳". */
  detailHe: string | null;
  minutes?: number;
  /** Not draggable (another track shown for context, a past day). */
  locked?: boolean;
  /** The day it sits on in the user's saved week; null = new in this week. */
  homeDow: number | null;
  /** Show the "חדש" tag (a session added to a week the user already has). */
  isNew?: boolean;
  /** Host data (stored ids, the session's origin …) — never read by the builder. */
  data?: P;
}

export interface WbDay<P = unknown> {
  dow: number;
  /** The user can train this day (drop target). Closed days read "לא פנוי". */
  open: boolean;
  window: TimeWindow;
  sessions: WbSession<P>[];
  /** The engine's reason for this day, one line. */
  whyHe: string | null;
}

export interface WbWeek<P = unknown> {
  /** Always 7, Sunday first. */
  days: WbDay<P>[];
  /** Week-level engine warnings, most important first. */
  warningsHe: string[];
}

/** One drag (or "move to day" from the day sheet). */
export interface WbMove {
  sessionId: string;
  toDow: number;
}

export type WbMoveResult<P = unknown> =
  | { ok: true; week: WbWeek<P>; swappedWith: string | null }
  | { ok: false; reasonHe: string };

/** The engine-side rules a week is validated by (the same caps the engine built it with). */
export interface WbRules {
  /** 2 = a run and a strength session may share a day. */
  maxPerDay: 1 | 2;
  /** Distinct training days cap (the days-per-week the user picked). */
  maxTrainingDays?: number;
  runLevel: TrainingLevel | null;
  /** The user's long-run day for the "why" lines (S1); null = the last free day. */
  preferredLongRunDay?: number | null;
}

/** What the builder needs from its host: validate + re-explain a move (engine v2 underneath). */
export interface WeekBuilderEngine<P = unknown> {
  move(week: WbWeek<P>, move: WbMove): WbMoveResult<P>;
}
