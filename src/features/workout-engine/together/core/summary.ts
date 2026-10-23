import { cheersReceived } from './cheers';
import { computeRace } from './race';
import type { PresenceEntry, TogetherKind } from './types';

/**
 * The together layer of the post-workout summary (owner, 23.10): a collective
 * "together" line, an EQUAL participant list with NO ranking (me first, then
 * alphabetical), a closeness line for a pair, and a head-to-head result ONLY
 * when this user picked a duel. No MVP, no podium. Pure — fed by the final
 * presence docs of the session.
 */

export interface SummaryPerson {
  uid: string;
  name: string;
  photoURL?: string;
  isMe: boolean;
  distanceKm: number;
  paceSecPerKm: number;
  sets: number;
  rounds: number;
  minutes: number;
  cheers: number;
}

export interface DuelResult {
  uid: string;
  name: string;
  meKm: number;
  themKm: number;
  gapKm: number;
  leader: 'me' | 'them' | 'even';
}

export interface TogetherSummary {
  kind: TogetherKind;
  count: number;
  totals: { distanceKm: number; sets: number; rounds: number; minutes: number };
  people: SummaryPerson[];
  /** Pair only: the distance between the two finishers, metres (null when not a run pair). */
  closenessMeters: number | null;
  duel: DuelResult | null;
}

const n = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function buildTogetherSummary(entries: PresenceEntry[], meUid: string | null | undefined): TogetherSummary | null {
  if (entries.length < 2) return null; // "together" needs at least two
  const kind = entries.find((e) => e.uid === meUid)?.kind ?? entries[0].kind;
  const received = cheersReceived(entries);
  const people: SummaryPerson[] = entries.map((e) => ({
    uid: e.uid,
    name: e.name,
    ...(e.photoURL ? { photoURL: e.photoURL } : {}),
    isMe: e.uid === meUid,
    distanceKm: n(e.distanceKm),
    paceSecPerKm: n(e.paceSecPerKm),
    sets: n(e.set),
    rounds: n(e.roundsDone ?? e.round),
    minutes: n(e.minute),
    cheers: received[e.uid] ?? 0,
  }));
  // Equal list: me first, then by name — never by performance.
  people.sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name, 'he') || a.uid.localeCompare(b.uid));

  const totals = people.reduce(
    (t, p) => ({ distanceKm: t.distanceKm + p.distanceKm, sets: t.sets + p.sets, rounds: t.rounds + p.rounds, minutes: t.minutes + p.minutes }),
    { distanceKm: 0, sets: 0, rounds: 0, minutes: 0 },
  );
  totals.distanceKm = Math.round(totals.distanceKm * 100) / 100;

  const closenessMeters = kind === 'run' && people.length === 2
    ? Math.round(Math.abs(people[0].distanceKm - people[1].distanceKm) * 1000)
    : null;

  const mine = entries.find((e) => e.uid === meUid);
  const rival = mine?.duelUid ? entries.find((e) => e.uid === mine.duelUid) : undefined;
  let duel: DuelResult | null = null;
  if (mine && rival && kind === 'run') {
    const r = computeRace(mine, rival);
    duel = { uid: rival.uid, name: rival.name, meKm: n(mine.distanceKm), themKm: n(rival.distanceKm), gapKm: Math.abs(r.gapKm), leader: r.leader };
  }
  return { kind, count: people.length, totals, people, closenessMeters, duel };
}
