/**
 * Persona + mission files (scripts/qa/personas/*.json, scripts/qa/missions/*.json) — shapes and
 * a strict validator (pure; unit-tested). A file that fails validation stops the run before any
 * token is minted.
 */
import { DEVICES, HARD_CAPS } from './config';
import { GPS_PROFILES, type GpsProfileId } from './gps';
import { RULE_IDS } from './checklist';

export interface Persona {
  id: string;
  /** Display name (Hebrew), age and one-paragraph description the model role-plays. */
  name: string;
  age: number;
  summary: string;
  techLiteracy: 'low' | 'medium' | 'high';
  patience: 'low' | 'medium' | 'high';
  traits: string[];
}

export type WorldEventKind = 'gps_lose_signal' | 'gps_poor_accuracy' | 'offline' | 'background_app';

export interface WorldEvent {
  /** Fire once the simulated GPS has covered this distance (requires gps), or at this step. */
  atDistanceM?: number;
  atStep?: number;
  do: WorldEventKind;
  seconds: number;
}

export interface Mission {
  id: string;
  persona: string;
  /** The tester account (must be registered in demo_registry/testers). */
  uid: string;
  device: string;
  cohort: 'v2' | 'today';
  /** Path to open after sign-in. */
  start: string;
  goal: string;
  success: string[];
  gps?: { route: Array<[number, number]>; profile: GpsProfileId; basePaceMinPerKm: number; loop?: boolean };
  worldEvents?: WorldEvent[];
  /** Path prefixes the tester must never open (e.g. /settings/account, /ai-coach). */
  forbidden: string[];
  budget: { maxSteps: number; maxMinutes: number };
  focusRules: string[];
}

const ID = /^[A-Za-z0-9_-]{2,40}$/;
const UID = /^demo_qa_[a-z0-9_]{3,40}$/;

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isStr = (v: unknown, min = 1): v is string => typeof v === 'string' && v.trim().length >= min;
const strArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function validatePersona(raw: unknown): Validation<Persona> {
  const e: string[] = [];
  const p = (raw ?? {}) as Record<string, unknown>;
  if (!isStr(p.id) || !ID.test(p.id)) e.push('persona.id');
  if (!isStr(p.name)) e.push('persona.name');
  if (typeof p.age !== 'number' || p.age < 14 || p.age > 100) e.push('persona.age');
  if (!isStr(p.summary, 20)) e.push('persona.summary');
  for (const k of ['techLiteracy', 'patience'] as const) if (!['low', 'medium', 'high'].includes(p[k] as string)) e.push(`persona.${k}`);
  if (!strArr(p.traits)) e.push('persona.traits');
  return e.length ? { ok: false, errors: e } : { ok: true, value: p as unknown as Persona };
}

export function validateMission(raw: unknown, personas: ReadonlySet<string>): Validation<Mission> {
  const e: string[] = [];
  const m = (raw ?? {}) as Record<string, unknown>;
  if (!isStr(m.id) || !ID.test(m.id)) e.push('mission.id');
  if (!isStr(m.persona) || !personas.has(m.persona)) e.push('mission.persona (unknown persona)');
  if (!isStr(m.uid) || !UID.test(m.uid)) e.push('mission.uid (must be demo_qa_*)');
  if (!isStr(m.device) || !DEVICES[m.device]) e.push('mission.device');
  if (m.cohort !== 'v2' && m.cohort !== 'today') e.push('mission.cohort');
  if (!isStr(m.start) || !m.start.startsWith('/') || m.start.startsWith('//')) e.push('mission.start');
  if (!isStr(m.goal, 10)) e.push('mission.goal');
  if (!strArr(m.success) || m.success.length === 0) e.push('mission.success');
  if (!strArr(m.forbidden)) e.push('mission.forbidden');
  const b = (m.budget ?? {}) as Record<string, unknown>;
  if (typeof b.maxSteps !== 'number' || b.maxSteps < 1 || b.maxSteps > HARD_CAPS.maxStepsPerSession) e.push('mission.budget.maxSteps');
  if (typeof b.maxMinutes !== 'number' || b.maxMinutes < 1 || b.maxMinutes > HARD_CAPS.maxSessionMinutes) e.push('mission.budget.maxMinutes');
  if (!strArr(m.focusRules) || m.focusRules.some((r) => !RULE_IDS.has(r))) e.push('mission.focusRules (unknown rule id)');
  if (m.gps !== undefined) {
    const g = m.gps as Record<string, unknown>;
    const route = g.route;
    const okRoute =
      Array.isArray(route) &&
      route.length >= 2 &&
      route.every((pt) => Array.isArray(pt) && pt.length === 2 && Math.abs(pt[0] as number) <= 90 && Math.abs(pt[1] as number) <= 180);
    if (!okRoute) e.push('mission.gps.route');
    if (!GPS_PROFILES[g.profile as GpsProfileId]) e.push('mission.gps.profile');
    if (typeof g.basePaceMinPerKm !== 'number' || g.basePaceMinPerKm < 2.5 || g.basePaceMinPerKm > 25) e.push('mission.gps.basePaceMinPerKm');
  }
  if (m.worldEvents !== undefined) {
    const ok =
      Array.isArray(m.worldEvents) &&
      m.worldEvents.every((w: Record<string, unknown>) =>
        ['gps_lose_signal', 'gps_poor_accuracy', 'offline', 'background_app'].includes(w.do as string) &&
        typeof w.seconds === 'number' && w.seconds > 0 && w.seconds <= 120 &&
        (typeof w.atDistanceM === 'number' || typeof w.atStep === 'number') &&
        (typeof w.atDistanceM !== 'number' || m.gps !== undefined),
      );
    if (!ok) e.push('mission.worldEvents');
  }
  return e.length ? { ok: false, errors: e } : { ok: true, value: m as unknown as Mission };
}
