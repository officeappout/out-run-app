import type { PresenceEntry } from './types';

export interface LobbyPerson {
  uid: string;
  name: string;
  photoURL?: string;
  isMe: boolean;
  /** Opened the lobby and said "I'm here". */
  here: boolean;
  level?: number;
  usualPaceSecPerKm?: number;
}

type Profiles = Record<string, { name: string; photoURL?: string }>;

/**
 * Who is in the waiting room: everyone registered (attendee profiles) plus
 * anyone who published presence; those whose presence says `ready` are "here".
 * Me first, then people who are here, then the rest — each group by name.
 */
export function buildLobbyRoster(profiles: Profiles, entries: PresenceEntry[], meUid: string | null | undefined): LobbyPerson[] {
  const byUid = new Map<string, LobbyPerson>();
  for (const [uid, p] of Object.entries(profiles)) {
    byUid.set(uid, { uid, name: p.name, ...(p.photoURL ? { photoURL: p.photoURL } : {}), isMe: uid === meUid, here: false });
  }
  for (const e of entries) {
    const prev = byUid.get(e.uid);
    byUid.set(e.uid, {
      uid: e.uid,
      name: prev?.name || e.name,
      ...((prev?.photoURL ?? e.photoURL) ? { photoURL: prev?.photoURL ?? e.photoURL } : {}),
      isMe: e.uid === meUid,
      here: e.ready === true,
      ...(e.level != null ? { level: e.level } : {}),
      ...(e.usualPaceSecPerKm != null ? { usualPaceSecPerKm: e.usualPaceSecPerKm } : {}),
    });
  }
  const group = (p: LobbyPerson) => (p.isMe ? 0 : p.here ? 1 : 2);
  return Array.from(byUid.values()).sort((a, b) => group(a) - group(b) || a.name.localeCompare(b.name, 'he') || a.uid.localeCompare(b.uid));
}
