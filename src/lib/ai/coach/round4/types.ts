/**
 * Kelly round 4 (flag ai_coach_round4) — what a turn adds under Kelly's reply besides text,
 * workout cards and chips: an aerobic session card and a short list of nearby parks. Pure.
 *
 * Streamed as {type:'round4', extras} and stored on the assistant message as `round4`.
 * Everything is re-validated when read back (parseRound4Extras): a stored message can never
 * carry an arbitrary link — the card's target is rebuilt on the device from these fields.
 */
import { z } from 'zod';
import { HELP_CHAPTER_IDS } from '@/lib/app-help/chapters';

export const AEROBIC_KINDS = ['walk', 'easy_run', 'program_run'] as const;
export type AerobicKind = (typeof AEROBIC_KINDS)[number];

export const AerobicCardViewSchema = z.object({
  id: z.string().regex(/^aer-[a-z0-9-]{4,40}$/),
  kind: z.enum(AEROBIC_KINDS),
  title: z.string().min(1).max(60),
  /** Planned minutes (null = the program decides, or a distance goal). */
  minutes: z.number().int().min(5).max(180).nullable(),
  distanceKm: z.number().min(0.5).max(60).nullable(),
  /** One short guidance line (effort, talk test). */
  cue: z.string().max(120),
  /** Strength stations along the way (the map's run/walk + strength). */
  strengthStops: z.boolean(),
  /** A loop near the user's area was found ('found', with its length) or the user picks one on the map. */
  route: z.object({ status: z.enum(['found', 'map']), distanceKm: z.number().min(0.3).max(60).optional() }),
  /** The free run/walk drawer's goal (the card opens /map?openRun=… pre-filled). */
  goal: z.object({ type: z.enum(['time', 'distance']), value: z.number().min(0.5).max(180) }),
});
export type AerobicCardView = z.infer<typeof AerobicCardViewSchema>;

export const ParkCardViewSchema = z.object({
  parkId: z.string().regex(/^[A-Za-z0-9_-]{4,64}$/),
  name: z.string().min(1).max(80),
  distanceKm: z.number().min(0).max(100),
  /** Hebrew names of the key equipment (max 4). */
  equipment: z.array(z.string().max(40)).max(4),
  area: z.string().max(60).nullable(),
});
export type ParkCardView = z.infer<typeof ParkCardViewSchema>;

export const Round4ExtrasSchema = z.object({
  aerobic: AerobicCardViewSchema.optional(),
  parks: z.array(ParkCardViewSchema).max(3).optional(),
});
export type Round4Extras = z.infer<typeof Round4ExtrasSchema>;

export function parseRound4Extras(raw: unknown): Round4Extras | null {
  const r = Round4ExtrasSchema.safeParse(raw);
  if (!r.success) return null;
  return r.data.aerobic || r.data.parks?.length ? r.data : null;
}

export function hasRound4Extras(x: Round4Extras | null | undefined): x is Round4Extras {
  return !!x && (!!x.aerobic || !!x.parks?.length);
}

/** Per-turn round 4 state (ServerToolContext.turn.round4), carried across a client-tool round. */
export interface Round4TurnState {
  extras: Round4Extras;
  /** start_tutorial chose this chapter this turn. */
  tutorial?: (typeof HELP_CHAPTER_IDS)[number];
  /** The aerobic card was an easy run for a user with no running program / pace profile. */
  offerQuestionnaire?: boolean;
  /** No route attached: offer "pick a route on the map" for this activity. */
  pickRoute?: 'running' | 'walking';
}

export function newRound4TurnState(): Round4TurnState {
  return { extras: {} };
}
