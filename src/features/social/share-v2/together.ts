/**
 * The "together" story (SH-5c) — live group / pair runs only. Pure,
 * unit-tested. Avatars are initials for everyone: the device has no age
 * signal for the other participants, so no one's photo is drawn.
 */
import { formatSecPerKm } from '../services/feed-post-details';
import type { ShareTogether } from '../services/share-image';
import type { ShareTogetherModel } from './types';

export const MAX_AVATARS = 4;
export const MAX_PEOPLE_ROWS = 4;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** "דניאל כהן" → "דכ", "נועה" → "נו", "" → "?". Strips geresh/quotes. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/["'׳״]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('');
  return Array.from(words[0])[0] + Array.from(words[1])[0];
}

/** "נועה ודניאל" / "נועה, דניאל ועוד 3". */
export function namesLine(names: string[], total: number): string {
  const first = names.map(firstName).filter(Boolean);
  if (!first.length) return `${total} רצים יחד`;
  if (total <= 2 && first.length >= 2) return `${first[0]} ו${first[1]}`;
  const shown = first.slice(0, 2);
  const more = total - shown.length;
  return more > 0 ? `${shown.join(', ')} ועוד ${more}` : shown.join(', ');
}

export function buildTogetherModel(t: ShareTogether | undefined): ShareTogetherModel | undefined {
  if (!t || t.participantCount < 2 || t.people.length < 2) return undefined;
  const people = t.people.filter((p) => p.name?.trim());
  if (people.length < 2) return undefined;
  // Me first, then the others in the given order.
  const ordered = [...people.filter((p) => p.isMe), ...people.filter((p) => !p.isMe)];
  const maxKm = Math.max(0, ...ordered.map((p) => p.km ?? 0));
  const total = Math.max(t.participantCount, ordered.length);
  return {
    names: namesLine(ordered.map((p) => p.name), total),
    subline: ['רצנו יחד', t.groupName?.trim()].filter(Boolean).join(' · '),
    avatars: ordered.slice(0, MAX_AVATARS).map((p) => initialsOf(p.name)),
    moreCount: Math.max(0, total - MAX_AVATARS),
    jointKm: t.collectiveKm && t.collectiveKm > 0 ? t.collectiveKm.toFixed(1) : undefined,
    participantCount: total,
    people: ordered
      .filter((p) => (p.km ?? 0) > 0)
      .slice(0, MAX_PEOPLE_ROWS)
      .map((p) => ({
        name: firstName(p.name),
        initials: initialsOf(p.name),
        km: (p.km as number).toFixed(1),
        frac: maxKm > 0 ? (p.km as number) / maxKm : undefined,
        pace: p.paceSecPerKm && p.paceSecPerKm > 0 ? formatSecPerKm(p.paceSecPerKm) : undefined,
        isMe: !!p.isMe,
      })),
  };
}

/** Structural subset of useGroupSummaryCtx's GroupSummaryCtx (pace in min/km). */
export interface GroupCtxLike {
  groupName: string;
  collectiveDistanceKm: number;
  participantCount: number;
  participants: { uid: string; name: string; distanceKm: number; pace: number }[];
}

/** The summary's group context → the share input's `together` (≥ 2 people). */
export function togetherFromGroupCtx(ctx: GroupCtxLike | null | undefined, currentUid: string | undefined): ShareTogether | undefined {
  if (!ctx || ctx.participantCount < 2 || ctx.participants.length < 2) return undefined;
  return {
    groupName: ctx.groupName || undefined,
    collectiveKm: ctx.collectiveDistanceKm > 0 ? ctx.collectiveDistanceKm : undefined,
    participantCount: ctx.participantCount,
    people: ctx.participants.map((p) => ({
      name: p.name,
      km: p.distanceKm > 0 ? p.distanceKm : undefined,
      paceSecPerKm: p.pace > 0 ? Math.round(p.pace * 60) : undefined,
      isMe: !!currentUid && p.uid === currentUid,
    })),
  };
}
