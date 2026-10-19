/**
 * The wire schema for a GenerationLogDraft (zod). The server parses every incoming draft with it
 * — bounded sizes, known enums, no extra keys — so a client can never store free text, names or
 * exact coordinates through the log route. Pure (zod only).
 */
import { z } from 'zod';
import { GENERATION_TYPES, REPORT_NOTE_MAX, REPORT_REASONS } from '../types';

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const Num = z.number().finite();
const NumOrNull = Num.nullable();
const Short = z.string().max(80);
const ActivityZ = z.enum(['walk', 'run', 'cycle', 'strength', 'rest', 'other']);

export const LOG_ID_RE = /^g[a-z0-9]{8,40}$/;
export const LogIdZ = z.string().regex(LOG_ID_RE);

const ExerciseZ = z.object({
  id: Id,
  pattern: Short.nullable(),
  sets: NumOrNull,
  reps: NumOrNull.optional(),
  durationSec: NumOrNull.optional(),
  level: NumOrNull.optional(),
  equipment: z.array(Short).max(12).optional(),
  hasMedia: z.boolean().nullable().optional(),
  gearOk: z.boolean().nullable().optional(),
}).strict();

const LegZ = z.object({
  activity: ActivityZ,
  distanceM: NumOrNull,
  minutes: NumOrNull,
  parkId: Id.nullable().optional(),
  exercises: z.array(ExerciseZ).max(30).optional(),
}).strict();

const StationZ = z.object({
  parkId: Id,
  lat: Num.min(-90).max(90),
  lng: Num.min(-180).max(180),
  distanceToRouteM: NumOrNull,
  equipment: z.array(Short).max(30).nullable().optional(),
}).strict();

const RouteZ = z.object({
  polyline: z.string().max(12_000),
  loop: z.boolean(),
  targetKm: NumOrNull,
  source: z.enum(['mapbox_v1', 'mapbox_legacy', 'graphhopper', 'official', 'unknown']),
  metrics: z.object({
    lengthM: Num,
    spurCount: Num,
    uTurnCount: Num,
    retracedPct: Num,
    selfIntersections: Num,
    compactness: Num,
    distanceErrorPct: NumOrNull,
    unmarkedCrossings: NumOrNull,
    majorRoadPct: NumOrNull,
  }).strict(),
}).strict();

const InputZ = z.object({
  requestedActivity: ActivityZ.nullable().optional(),
  targetMinutes: NumOrNull.optional(),
  targetKm: NumOrNull.optional(),
  focus: Short.nullable().optional(),
  location: z.enum(['home', 'park', 'street', 'office', 'gym']).nullable().optional(),
  equipment: z.array(Short).max(40).nullable().optional(),
  levels: z.record(z.string().max(40), Num).refine((r) => Object.keys(r).length <= 20).optional(),
  personaIds: z.array(Short).max(10).optional(),
  budget: z.object({
    dailySetsLeft: NumOrNull.optional(),
    weeklySetsLeft: NumOrNull.optional(),
    lightMode: z.boolean().optional(),
  }).strict().optional(),
  // geohash-5 exactly: the only location form accepted.
  areaGeohash5: z.string().regex(/^[0-9b-hjkmnp-z]{5}$/).nullable().optional(),
  flags: z.record(z.string().max(60), z.boolean()).refine((r) => Object.keys(r).length <= 30).optional(),
}).strict();

const OutputZ = z.object({
  title: z.string().max(120).nullable().optional(),
  planLabel: z.string().max(80).nullable().optional(),
  planActivity: ActivityZ.nullable().optional(),
  totalMinutes: NumOrNull,
  exercises: z.array(ExerciseZ).max(40),
  legs: z.array(LegZ).max(30),
  stations: z.array(StationZ).max(20),
  route: RouteZ.nullable(),
}).strict();

export const GenerationLogDraftZ = z.object({
  id: LogIdZ,
  type: z.enum(GENERATION_TYPES),
  generator: Short.nullable().optional(),
  input: InputZ,
  output: OutputZ,
  fingerprint: z.string().regex(/^[a-z0-9]{1,16}$/),
  appVersion: z.string().max(40).nullable().optional(),
  platform: z.enum(['ios', 'android', 'web']).nullable().optional(),
  shownAtMs: Num,
}).strict();

export const OutcomeBodyZ = z.object({
  id: LogIdZ,
  status: z.enum(['started', 'completed', 'abandoned']),
  swappedExercises: z.number().int().min(0).max(100).optional(),
  completedPct: z.number().min(0).max(1).nullable().optional(),
}).strict();

export const ReportBodyZ = z.object({
  id: LogIdZ,
  reasons: z.array(z.enum(REPORT_REASONS)).min(1).max(REPORT_REASONS.length),
  note: z.string().max(REPORT_NOTE_MAX).nullable().optional(),
  /** The session summary, when the device has it — lets a report store an unsampled session. */
  draft: GenerationLogDraftZ.optional(),
}).strict();
