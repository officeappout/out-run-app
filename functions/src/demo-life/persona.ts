/**
 * Demo world — a persona as the live engine sees it (pure). The seed writes one `life`
 * block per persona into demo_registry/personas.personas[i].life (scripts/demo/lib/world.ts
 * lifeEntryOf): the knobs (adherence, share rate, step goal, tone), the scopes, the park,
 * and the week the REAL schedule engine built — flat, because Firestore has no nested
 * arrays: sessions[] = { dow, i, kind, slug?, slot?, minutes, title, start 'HH:MM' }.
 *
 * Parsing is strict about identity (uid demo_, every scope demo-, groups demo-) and
 * lenient about the rest; a persona that fails is skipped, never "fixed".
 */
import { isDemoTenantId, isDemoUid } from '../lib/demo';
import type { LifePark, LifeSession, SessionActor } from './session-docs';

export type Tone = 'parent' | 'vatikim' | 'student' | 'office_worker' | 'military';
export const TONES: Tone[] = ['parent', 'vatikim', 'student', 'office_worker', 'military'];

export interface LifeWeekSession extends LifeSession {
  /** 0 = Sunday. */
  dow: number;
  /** Index of the session within its day — the same i the seed uses in doc ids. */
  i: number;
  /** Planned start, Israel time, 'HH:MM'. */
  start: string;
}

export interface LifePersona extends SessionActor {
  key: string;
  tone: Tone;
  adherence: number;
  stepGoal: number;
  sessions: LifeWeekSession[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const KINDS = new Set(['strength', 'run', 'walk', 'mobility']);

function parseSession(raw: unknown): LifeWeekSession | null {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const dow = num(s.dow, 0, 6);
  const i = num(s.i, 0, 9);
  const minutes = num(s.minutes, 5, 240);
  const start = str(s.start);
  const title = str(s.title);
  if (dow === null || i === null || minutes === null || !start || !HHMM.test(start) || !title || !KINDS.has(String(s.kind))) return null;
  return {
    dow,
    i,
    kind: s.kind as LifeSession['kind'],
    ...(str(s.slug) ? { slug: str(s.slug)! } : {}),
    ...(str(s.slot) ? { slot: str(s.slot)! } : {}),
    minutes,
    title,
    start,
  };
}

function parsePark(raw: unknown): LifePark | null {
  const p = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!p) return null;
  const id = str(p.id);
  const name = str(p.name);
  const lat = num(p.lat, -90, 90);
  const lng = num(p.lng, -180, 180);
  return id && name && lat !== null && lng !== null ? { id, name, lat, lng } : null;
}

/** One registry row → a LifePersona, or null (skipped) when anything identity-related is off. */
export function parseLifePersona(row: unknown): LifePersona | null {
  const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  const uid = str(r.uid);
  const life = (r.life && typeof r.life === 'object' ? r.life : null) as Record<string, unknown> | null;
  if (!uid || !isDemoUid(uid) || !life) return null;
  const authorityId = str(life.authorityId);
  const tenantId = str(life.tenantId);
  const neighborhoodId = str(life.neighborhoodId);
  const unitId = str(life.unitId);
  if (!isDemoTenantId(authorityId) || !isDemoTenantId(tenantId)) return null;
  if (neighborhoodId && !isDemoTenantId(neighborhoodId)) return null;
  if (unitId && !isDemoTenantId(unitId)) return null;
  const groupIds = Array.isArray(life.groupIds) ? life.groupIds.filter((g): g is string => typeof g === 'string') : [];
  if (groupIds.some((g) => !isDemoTenantId(g))) return null;
  const home = (life.home && typeof life.home === 'object' ? life.home : {}) as Record<string, unknown>;
  const lat = num(home.lat, -90, 90);
  const lng = num(home.lng, -180, 180);
  const name = str(life.name);
  const gender = life.gender === 'female' ? 'female' : life.gender === 'male' ? 'male' : null;
  if (!name || !gender || lat === null || lng === null) return null;
  const sessions = (Array.isArray(life.sessions) ? life.sessions : []).map(parseSession).filter((s): s is LifeWeekSession => !!s);
  const tone = TONES.includes(life.tone as Tone) ? (life.tone as Tone) : 'office_worker';
  return {
    uid,
    key: str(r.key) ?? uid.slice('demo_'.length),
    name,
    gender,
    age: num(life.age, 10, 110) ?? 30,
    tone,
    adherence: num(life.adherence, 0, 1) ?? 0.7,
    shareRate: num(life.shareRate, 0, 1) ?? 0.5,
    stepGoal: num(life.stepGoal, 1000, 40000) ?? 8000,
    parkUser: life.parkUser === true,
    authorityId: authorityId!,
    neighborhoodId,
    tenantId: tenantId!,
    unitId,
    groupIds,
    home: { lat, lng },
    park: parsePark(life.park),
    runLevel: str(life.runLevel) ?? 'beginner',
    sessions,
  };
}

export function parseLifePersonas(registryPersonasDoc: Record<string, unknown> | undefined | null): LifePersona[] {
  const rows = Array.isArray(registryPersonasDoc?.personas) ? (registryPersonasDoc!.personas as unknown[]) : [];
  return rows.map(parseLifePersona).filter((p): p is LifePersona => !!p);
}
