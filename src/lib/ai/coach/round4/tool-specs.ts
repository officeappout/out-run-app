/**
 * Kelly round 4 tools (flag ai_coach_round4) — zod + JSON schemas. Pure. Registered in
 * COACH_TOOLS (tools.ts) and offered only while the flag is on (ROUND4_TOOL_NAMES).
 */
import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import { HELP_CHAPTER_IDS } from '@/lib/app-help/chapters';

export const ROUND4_TOOL_NAMES: readonly string[] = ['plan_aerobic_session', 'find_nearby_parks', 'get_weather', 'start_tutorial'];

export const PlanAerobicInput = z.object({
  activity: z.enum(['run', 'walk']),
  durationMin: z.number().int().min(5).max(120).optional(),
  distanceKm: z.number().min(0.5).max(42).optional(),
  strengthStops: z.boolean().default(false),
  withRoute: z.boolean().default(true),
  intent: z.string().max(80).optional(),
});
export type PlanAerobicInputT = z.infer<typeof PlanAerobicInput>;

export const PARK_FOCUSES = ['any', 'pull', 'push', 'legs', 'core'] as const;
export const FindNearbyParksInput = z.object({ focus: z.enum(PARK_FOCUSES).default('any') });
export type FindNearbyParksInputT = z.infer<typeof FindNearbyParksInput>;

export const GetWeatherInput = z.object({});

export const StartTutorialInput = z.object({ topic: z.enum(HELP_CHAPTER_IDS) });
export type StartTutorialInputT = z.infer<typeof StartTutorialInput>;

type Spec = { name: string; kind: 'server'; description: string; inputSchema: Anthropic.Tool.InputSchema; zod: z.ZodTypeAny };

export const ROUND4_TOOLS = {
  plan_aerobic_session: {
    name: 'plan_aerobic_session',
    kind: 'server',
    description:
      "Plans a walk or a run for the user and shows it as a card they open on the map (the app's free run and walk, pre-filled, with suggested loop routes). It uses the user's running program when they have one (today's planned run), otherwise an easy run by feel, never a pace. strengthStops adds strength stations along the way (walk or run + strength). Returns the card facts (kind, title, minutes or km, the effort cue, the route) and notesForCoach. Use it for every walk, run or aerobic request, also as the first part of a combo (then build the strength or core part with generate_workout in the same reply).",
    inputSchema: {
      type: 'object',
      properties: {
        activity: { type: 'string', enum: ['run', 'walk'] },
        durationMin: { type: 'integer', minimum: 5, maximum: 120, description: 'Only when the user named a length' },
        distanceKm: { type: 'number', minimum: 0.5, maximum: 42, description: 'Only when the user named a distance' },
        strengthStops: { type: 'boolean', description: 'Strength stations along the route (walk or run + strength outdoors)' },
        withRoute: { type: 'boolean', description: 'Look for a loop route near the user (default true)' },
        intent: { type: 'string', maxLength: 80 },
      },
      required: ['activity'],
      additionalProperties: false,
    },
    zod: PlanAerobicInput,
  },
  find_nearby_parks: {
    name: 'find_nearby_parks',
    kind: 'server',
    description:
      "Finds up to 3 published outdoor gyms (parks with fitness equipment) closest to the user's usual area, filtered by what the workout needs (pull: a pull-up bar, push: parallel bars, core, legs, any). Returns each park's name, distance in km and key equipment; the parks appear under your reply and a tap opens the park on the map. Use it for \"where is a park\" and when a home workout is below the user's level or short of exercises.",
    inputSchema: {
      type: 'object',
      properties: { focus: { type: 'string', enum: [...PARK_FOCUSES] } },
      additionalProperties: false,
    },
    zod: FindNearbyParksInput,
  },
  get_weather: {
    name: 'get_weather',
    kind: 'server',
    description:
      "The weather now and in the next hours in the user's area (temperature, feels like, rain chance, a heat, cold, rain or UV flag with a short Hebrew label). Returns available false when weather is off for this user or there is no area. Use it when asked about the weather and before recommending outdoor training today.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    zod: GetWeatherInput,
  },
  start_tutorial: {
    name: 'start_tutorial',
    kind: 'server',
    description:
      'Starts the in-app guided tour for a topic (map: parks and the map, workouts: today\'s workout and building one, schedule: the weekly schedule, running, kelly, settings) as a button under your reply, plus the help screen with questions and answers. Returns what the tour shows. Use it for "how do I use the app", "show me", "is there a tutorial".',
    inputSchema: {
      type: 'object',
      properties: { topic: { type: 'string', enum: [...HELP_CHAPTER_IDS] } },
      required: ['topic'],
      additionalProperties: false,
    },
    zod: StartTutorialInput,
  },
} as const satisfies Record<string, Spec>;
