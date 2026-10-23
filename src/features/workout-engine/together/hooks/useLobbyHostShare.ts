'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createSessionInvitation, type SessionMeta } from '@/features/arena/services/group-invitation.service';
import { createRunInvite } from '@/lib/workoutInvite';
import { sessionDateTimeOf } from '../core/schedule';

/** Lobby host: am I the creator, and a share link (same two paths as the classic lobby). */
export function useLobbyHostShare(p: {
  uid?: string;
  groupId: string | null;
  attendanceId: string | null;
  groupName: string | null;
  ephemeralActivityType?: 'running' | 'walking';
}) {
  const [isHost, setIsHost] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const created = useRef(false);

  useEffect(() => {
    if (!p.groupId || !p.uid) return;
    getDoc(doc(db, 'community_groups', p.groupId)).then((snap) => {
      if (snap.exists()) setIsHost((snap.data().createdBy as string | undefined) === p.uid);
    }).catch(() => {});
  }, [p.groupId, p.uid]);

  useEffect(() => {
    if (!isHost || !p.groupId || !p.attendanceId || !p.uid || created.current) return;
    created.current = true;
    if (p.ephemeralActivityType) {
      createRunInvite(p.ephemeralActivityType, { fromLobby: true }).then((r) => setShareUrl(r.shareUrl)).catch(() => {});
    } else {
      const { date, time } = sessionDateTimeOf(p.attendanceId);
      const meta: SessionMeta = { sessionDate: date, sessionTime: time, groupName: p.groupName ?? '' };
      createSessionInvitation(p.groupId, p.attendanceId, p.uid, meta).then(({ url }) => setShareUrl(url)).catch(() => {});
    }
  }, [isHost, p.groupId, p.attendanceId, p.uid, p.groupName, p.ephemeralActivityType]);

  return { isHost, shareUrl };
}
