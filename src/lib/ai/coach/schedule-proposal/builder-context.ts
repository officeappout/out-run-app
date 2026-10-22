/**
 * Kelly in the week builder (enable_week_builder_v1, owner 22.10) — the "builder context":
 * the DRAFT week on screen, sent by the app with each chat request while the chat is open
 * over the week builder (signup strength / run / walk, add-track, the planner "סידור השבוע").
 * Pure and shared (the client builds it, the server re-validates it — never trust the wire).
 *
 * With it, propose_schedule_change works on this week instead of the saved schedule and its
 * card hands back raw moves the builder applies to the week on screen (nothing is saved:
 * the user still confirms with "אישור השבוע").
 */
import { z } from 'zod';
import type { WbRules, WbSession, WbWeek } from '@/features/schedule/week-builder/types';

const RUN_SLOTS = ['quality_primary', 'quality_secondary', 'long_run', 'easy_run', 'recovery'] as const;

const BuilderSessionSchema = z.object({
  id: z.string().min(1).max(80),
  track: z.enum(['strength', 'run', 'walk']),
  slug: z.string().max(60).optional(),
  slot: z.enum(RUN_SLOTS).optional(),
  long: z.boolean().optional(),
  minutes: z.number().int().min(1).max(600).optional(),
  locked: z.boolean().optional(),
  status: z.enum(['done', 'missed']).optional(),
  titleHe: z.string().max(60),
});

const BuilderDaySchema = z.object({
  dow: z.number().int().min(0).max(6),
  open: z.boolean(),
  past: z.boolean().optional(),
  sessions: z.array(BuilderSessionSchema).max(3),
});

export const BuilderContextSchema = z
  .object({
    days: z.array(BuilderDaySchema).length(7),
    rules: z.object({
      maxPerDay: z.union([z.literal(1), z.literal(2)]),
      maxTrainingDays: z.number().int().min(1).max(7).optional(),
      runLevel: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
      preferredLongRunDay: z.number().int().min(0).max(6).nullable().optional(),
    }),
  })
  .refine((c) => c.days.every((d, i) => d.dow === i), { message: 'days must be Sunday first' });
export type BuilderContext = z.infer<typeof BuilderContextSchema>;

/** One move of the week on screen (0 = Sunday). `sessionId` is the builder's own session id. */
export interface BuilderMove {
  from: number;
  to: number;
  sessionId: string;
}

/** The week on screen → the wire (only what the rules and Kelly need; host data stays home). */
export function builderContextOf<P>(week: WbWeek<P>, rules: WbRules): BuilderContext {
  const session = (s: WbSession<P>) => ({
    id: s.id,
    track: s.track,
    ...(s.slug ? { slug: s.slug } : {}),
    ...(s.slot ? { slot: s.slot } : {}),
    ...(s.long ? { long: true } : {}),
    ...(s.minutes ? { minutes: Math.round(s.minutes) } : {}),
    ...(s.locked ? { locked: true } : {}),
    ...(s.status ? { status: s.status } : {}),
    titleHe: s.titleHe.slice(0, 60),
  });
  return {
    days: week.days.map((d) => ({ dow: d.dow, open: d.open, ...(d.past ? { past: true } : {}), sessions: d.sessions.slice(0, 3).map(session) })),
    rules: {
      maxPerDay: rules.maxPerDay,
      ...(rules.maxTrainingDays ? { maxTrainingDays: rules.maxTrainingDays } : {}),
      runLevel: rules.runLevel,
      ...(rules.preferredLongRunDay !== undefined ? { preferredLongRunDay: rules.preferredLongRunDay } : {}),
    },
  };
}

/** The wire → a week the builder's pure move logic reads (the server's view of the draft). */
export function builderWeekOf(ctx: BuilderContext): { week: WbWeek; rules: WbRules } {
  return {
    week: {
      days: ctx.days.map((d) => ({
        dow: d.dow,
        open: d.open,
        ...(d.past ? { past: true } : {}),
        window: 'morning' as const,
        whyHe: null,
        sessions: d.sessions.map((s) => ({ ...s, detailHe: null, homeDow: d.dow })),
      })),
      warningsHe: [],
    },
    rules: { ...ctx.rules },
  };
}

/** A stored / streamed builderMoves list → validated moves, or null (never trust the wire). */
export function parseBuilderMoves(raw: unknown): BuilderMove[] | null {
  if (!Array.isArray(raw)) return null;
  const out: BuilderMove[] = [];
  for (const m of raw.slice(0, 3)) {
    const r = m as Record<string, unknown> | null;
    if (!r || typeof r.sessionId !== 'string' || !r.sessionId || r.sessionId.length > 80) return null;
    const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6;
    if (!ok(r.from) || !ok(r.to)) return null;
    out.push({ from: r.from, to: r.to, sessionId: r.sessionId });
  }
  return out.length ? out : null;
}
