import { TV_AVATAR_COUNT } from './constants';
import type { TvParticipant } from './types';

/** Equal list, no ranking: host first (tagged in the UI), then in the order people joined. */
export function orderParticipants(list: readonly TvParticipant[], hostUid: string | null): TvParticipant[] {
  return [...list]
    .filter((p) => p.state !== 'left')
    .sort((a, b) => {
      if (a.uid === hostUid) return -1;
      if (b.uid === hostUid) return 1;
      return a.joinedAtMs - b.joinedAtMs || a.uid.localeCompare(b.uid);
    });
}

const PALETTE = ['#f97316', '#a855f7', '#10b981', '#ec4899', '#0ea5e9', '#eab308', '#14b8a6', '#ef4444'];

/** Default avatar index for a uid (stable; no picker). */
export function defaultAvatar(uid: string): number {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return h % TV_AVATAR_COUNT;
}

/** Stable avatar colour per person (same on every screen); `avatar` wins when the doc has one. */
export function participantColor(uid: string, avatar?: number): string {
  const i = avatar != null && Number.isInteger(avatar) && avatar >= 0 && avatar < PALETTE.length ? avatar : defaultAvatar(uid);
  return PALETTE[i % PALETTE.length];
}

/** A shared screen shows a first name only. */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? '';
}

/** First letter of the name as one user-perceived character (emoji / combined marks safe). */
export function initialOf(name: string): string {
  const s = name.trim();
  if (!s) return '?';
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) {
    const first = Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s))[0];
    if (first) return first.segment;
  }
  return Array.from(s)[0] ?? '?';
}
