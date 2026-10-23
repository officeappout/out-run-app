'use client';

import React, { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { phoneLinkState } from '../core/connection';
import { useTvJoin } from '../hooks/useTvJoin';
import { useTvHostHeartbeat, useTvMirrorPublisher } from '../hooks/useTvHostLink';
import { useTvPresence } from '../hooks/useTvPresence';
import { useTvSessionView } from '../hooks/useTvSessionView';
import { getTvRepo } from '../services/tv-repo';
import TvConnectScreen from './TvConnectScreen';
import TvHostPanel from './TvHostPanel';
import TvJoinedPanel from './TvJoinedPanel';
import TvPhoneLost from './TvPhoneLost';
import TvRemote from './TvRemote';
import { clearConnection, readConnection, useTvPhoneStore } from './phone-store';

function useOnline(recheck: number): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, [recheck]);
  return online;
}

/** The phone's whole TV-mode UI: connect screen, host panel, remote, participant panel, lost state. */
export default function TvPhoneLayerInner() {
  const { view, code, role, mirror, controls, progress, phoneOnly, setPhoneOnly, reset, hide } = useTvPhoneStore();
  const { join } = useTvJoin();
  const [retryTick, setRetryTick] = useState(0);
  const online = useOnline(retryTick);
  const sv = useTvSessionView(code);
  const session = sv.session;
  const uid = auth.currentUser?.uid ?? null;

  // Resume after an app reload: re-enter the same code (host re-join is idempotent).
  useEffect(() => {
    if (code) return;
    const saved = readConnection();
    if (!saved) return;
    let cancelled = false;
    void auth.authStateReady().then(() => {
      if (!cancelled && !useTvPhoneStore.getState().code) void join(saved.code, null, saved.nickname ?? '');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The session is over for everyone (host ended it / 4 hours): forget it here.
  useEffect(() => {
    if (code && (sv.screen === 'ended' || sv.screen === 'expired')) {
      clearConnection();
      reset();
    }
  }, [code, sv.screen, reset]);

  const live = session?.status === 'live';
  const others = session?.hostUid ? sv.participants.filter((p) => p.uid !== session.hostUid).length : 0;
  useEffect(() => {
    if (role === 'host') useTvPhoneStore.getState().setOthers(others);
  }, [role, others]);

  // A host who comes back (app reload) into a workout that is already running must not meet the lobby panel.
  useEffect(() => {
    if (role === 'host' && live && view === 'host') hide();
  }, [role, live, view, hide]);
  useTvHostHeartbeat(code, role === 'host' && !!session && !phoneOnly && sv.screen !== 'ended');
  useTvMirrorPublisher(code, mirror, role === 'host' && live && !phoneOnly);
  useTvPresence(code, uid, role === 'participant' ? progress : null);

  const link = phoneLinkState({ online, session, nowMs: sv.serverNow });

  if (view === 'pair') return <TvConnectScreen />;
  if (!code || !session) return null;

  if (role === 'host') {
    if (live && link === 'lost' && !phoneOnly) {
      return (
        <TvPhoneLost
          onRetry={() => {
            setRetryTick((n) => n + 1); // re-read the network state…
            if (code) void getTvRepo().beat(code).catch(() => undefined); // …and nudge the link with a heartbeat
          }}
          onPhoneOnly={() => setPhoneOnly(true)}
        />
      );
    }
    if (live && mirror && controls && !phoneOnly) {
      return <TvRemote session={session} mirror={mirror} controls={controls} participants={sv.participants} serverNow={sv.serverNow} />;
    }
    if (view === 'host') return <TvHostPanel session={session} participants={sv.participants} />;
    return null;
  }
  if (role === 'participant' && view === 'joined') return <TvJoinedPanel session={session} participants={sv.participants} />;
  return null;
}
