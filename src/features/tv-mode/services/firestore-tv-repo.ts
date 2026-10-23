import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { TV_COLLECTION, TV_PARTICIPANTS } from '../core/constants';
import { isExpired } from '../core/expiry';
import { checkNickname } from '../core/nickname';
import { defaultAvatar } from '../core/participants';
import type { TvCommand, TvJoinResult, TvMirror, TvParticipant, TvSession, TvWorkoutInfo } from '../core/types';
import { parseParticipant, parseSession, stripUndefinedDeep } from './firestore-tv-parse';
import type { PresencePatch, TvSessionRepo, TvUser } from './tv-session-repo';

/**
 * TvSessionRepo on tvSessions/{code} (+ participants/{uid}). The doc is created server-side;
 * clients only claim host (transaction), write host fields as host, or write their own
 * participant doc. See docs/tv-mode/tv-sessions.rules.proposal — the rules are NOT in
 * firestore.rules yet (owner decision).
 */
export function createFirestoreTvRepo(db: Firestore, now: () => number = Date.now): TvSessionRepo {
  const sessionRef = (code: string) => doc(db, TV_COLLECTION, code);
  const partRef = (code: string, uid: string) => doc(db, TV_COLLECTION, code, TV_PARTICIPANTS, uid);

  return {
    subscribeSession(code, onSession, onError) {
      return onSnapshot(
        sessionRef(code),
        (snap) => onSession(snap.exists() ? parseSession(code, snap.data()) : null),
        onError,
      );
    },

    subscribeParticipants(code, onList, onError) {
      return onSnapshot(
        collection(db, TV_COLLECTION, code, TV_PARTICIPANTS),
        (snap) => {
          const list: TvParticipant[] = [];
          snap.forEach((d) => {
            const p = parseParticipant(d.id, d.data());
            if (p) list.push(p);
          });
          onList(list);
        },
        onError,
      );
    },

    async join(code, user: TvUser): Promise<TvJoinResult> {
      // A guest's nickname is shown on a shared screen: same check as the rules (core/nickname.ts).
      let name = user.name;
      if (user.guest) {
        const nick = checkNickname(user.name);
        if (!nick.ok) return { ok: false, error: 'invalid-nickname' };
        name = nick.value;
      }
      const avatar = user.avatar ?? defaultAvatar(user.uid);
      try {
        return await runTransaction(db, async (tx) => {
          const sRef = sessionRef(code);
          const sSnap = await tx.get(sRef);
          if (!sSnap.exists()) return { ok: false, error: 'not-found' } as const;
          const session = parseSession(code, sSnap.data()) as TvSession;
          if (session.status === 'ended') return { ok: false, error: 'ended' } as const;
          if (isExpired(session.expiresAtMs, now())) return { ok: false, error: 'expired' } as const;

          const pRef = partRef(code, user.uid);
          const pSnap = await tx.get(pRef);
          const claim = session.hostUid === null;
          // Only a signed-in account can host; a guest who arrives first waits for the host.
          if (claim && user.guest) return { ok: false, error: 'host-required' } as const;
          const role = claim || session.hostUid === user.uid ? 'host' : 'participant';

          if (claim) {
            tx.update(sRef, {
              hostUid: user.uid,
              hostName: name,
              hostGender: user.gender ?? null,
              status: 'lobby',
            });
          }
          if (pSnap.exists()) {
            tx.update(pRef, { state: 'joined' });
          } else {
            tx.set(pRef, { uid: user.uid, name, avatar, joinedAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(session.expiresAtMs), state: 'joined', seq: 0 });
          }
          const next: TvSession = claim
            ? { ...session, hostUid: user.uid, hostName: name, hostGender: user.gender ?? null, status: 'lobby' }
            : session;
          return { ok: true, role, session: next } as const;
        });
      } catch (e) {
        const code2 = (e as { code?: string })?.code;
        return { ok: false, error: code2 === 'unavailable' ? 'offline' : 'unknown' };
      }
    },

    async setWorkout(code, workout: TvWorkoutInfo) {
      await updateDoc(sessionRef(code), { workout: stripUndefinedDeep(workout) });
    },

    async startWorkout(code) {
      await updateDoc(sessionRef(code), { status: 'live', hostBeatAt: serverTimestamp() });
    },

    async writeMirror(code, mirror: TvMirror, restampTimer) {
      await updateDoc(sessionRef(code), {
        mirror: stripUndefinedDeep(mirror),
        ...(restampTimer ? { timerAnchorAt: serverTimestamp() } : {}),
      });
    },

    async beat(code) {
      await updateDoc(sessionRef(code), { hostBeatAt: serverTimestamp() });
    },

    async sendCommand(code, cmd: TvCommand) {
      await updateDoc(sessionRef(code), {
        cmd: stripUndefinedDeep(cmd),
        ...(cmd.type === 'volume' && cmd.value != null ? { volume: cmd.value } : {}),
      });
    },

    async end(code) {
      await updateDoc(sessionRef(code), { status: 'ended' });
    },

    async publishPresence(code, uid, patch: PresencePatch) {
      await setDoc(partRef(code, uid), stripUndefinedDeep(patch), { merge: true });
    },

    async leave(code, uid) {
      await setDoc(partRef(code, uid), { state: 'left' }, { merge: true });
    },
  };
}
