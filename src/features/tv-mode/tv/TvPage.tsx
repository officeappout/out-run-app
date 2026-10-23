'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import TvStageAdapter from '../adapter/TvStageAdapter';
import { buildStageModel } from '../adapter/stage-model';
import { isExpired } from '../core/expiry';
import { useAutoFocus } from '../hooks/useAutoFocus';
import { useFullscreen } from '../hooks/useFullscreen';
import { useNow } from '../hooks/useNow';
import { useTvSessionView } from '../hooks/useTvSessionView';
import { openTvSession } from '../services/open-tv-session';
import { PAGE_BG } from '../ui/styles';
import FullscreenGate from './FullscreenGate';
import FullscreenToggle from './FullscreenToggle';
import TvEndedScreen from './TvEndedScreen';
import { TvLostBanner, TvReconnectCorner } from './TvLostBanner';
import TvLobbyScreen from './TvLobbyScreen';
import TvPairingScreen from './TvPairingScreen';

const STORE_KEY = 'tv:session';

interface Stored { code: string; expiresAtMs: number }

function readStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    return typeof s.code === 'string' && typeof s.expiresAtMs === 'number' && !isExpired(s.expiresAtMs, Date.now()) ? s : null;
  } catch {
    return null;
  }
}
function writeStored(s: Stored | null): void {
  try {
    if (s) sessionStorage.setItem(STORE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* private mode: the TV just opens a new code after a reload */
  }
}

type Boot = 'gate' | 'opening' | 'ready' | 'error';

/** /tv — the TV side of TV mode (enable_tv_mode_v1): gate → code → lobby → live → ended. */
export default function TvPage() {
  const t = useT(wide);
  const { flags, loading } = useFeatureFlags();
  const fs = useFullscreen();
  const now = useNow(1000);
  const [boot, setBoot] = useState<Boot>('gate');
  const [code, setCode] = useState<string | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState(0);
  const [origin, setOrigin] = useState('');
  const view = useTvSessionView(code);

  useEffect(() => setOrigin(window.location.origin), []);

  const open = useCallback(async () => {
    setBoot('opening');
    try {
      const s = await openTvSession();
      writeStored(s);
      setCode(s.code);
      setExpiresAtMs(s.expiresAtMs);
      setBoot('ready');
    } catch {
      setBoot('error');
    }
  }, []);

  const start = useCallback(() => {
    void fs.enter(); // inside the click: needs the user gesture. A refusal only flips `denied`.
    const stored = readStored();
    if (stored) {
      setCode(stored.code);
      setExpiresAtMs(stored.expiresAtMs);
      setBoot('ready');
    } else void open();
  }, [fs, open]);

  const newCode = useCallback(() => {
    writeStored(null);
    setCode(null);
    void open();
  }, [open]);

  if (loading) return <main className={`fixed inset-0 ${PAGE_BG}`} />;
  if (!flags.enableTvModeV1) {
    return (
      <main dir="rtl" className={`fixed inset-0 grid place-items-center text-center ${PAGE_BG}`}>
        <div>
          <h1 className="text-[4vw] font-black">{t('pair.tv.unavailable')}</h1>
          <p className="mt-[2vh] text-[2vw] font-bold text-[#475569]">{t('pair.tv.unavailableBody')}</p>
        </div>
      </main>
    );
  }
  if (boot === 'gate') return <FullscreenGate onStart={start} />;

  let body: React.ReactNode;
  if (boot === 'opening' || (boot === 'ready' && !code)) {
    body = <Centered text={t('pair.tv.opening')} />;
  } else if (boot === 'error') {
    body = <TvErrorScreen title={t('pair.tv.error')} retry={t('pair.tv.retry')} onRetry={() => void open()} />;
  } else if (code) {
    const session = view.session;
    switch (view.screen) {
      case 'ended':
      case 'expired':
        body = <TvEndedScreen reason={view.screen} onNewCode={newCode} />;
        break;
      case 'lobby':
        body = session ? <TvLobbyScreen session={session} participants={view.participants} origin={origin} /> : null;
        break;
      case 'live':
      case 'lost':
        if (session?.mirror) {
          const model = buildStageModel({ mirror: session.mirror, timerAnchorAtMs: session.timerAnchorAtMs, serverNowMs: view.serverNow, friends: view.participants });
          body = (
            <>
              <TvStageAdapter model={model} banner={view.screen === 'lost' ? <TvLostBanner /> : undefined} />
              {view.screen === 'lost' && <TvReconnectCorner code={code} origin={origin} />}
            </>
          );
        } else if (session) {
          body = <TvLobbyScreen session={session} participants={view.participants} origin={origin} />;
        }
        break;
      default:
        body = <TvPairingScreen code={code} origin={origin} expiresAtMs={session?.expiresAtMs || expiresAtMs} nowMs={view.serverNow || now} />;
    }
  }

  return (
    <>
      {body}
      <FullscreenToggle fs={fs} />
    </>
  );
}

function TvErrorScreen({ title, retry, onRetry }: { title: string; retry: string; onRetry: () => void }) {
  const focusRef = useAutoFocus<HTMLButtonElement>();
  return (
    <main dir="rtl" className={`fixed inset-0 grid place-items-center text-center ${PAGE_BG}`}>
      <div className="flex flex-col items-center gap-[3vh]">
        <h1 className="text-[3.6vw] font-black">{title}</h1>
        <button
          ref={focusRef}
          type="button"
          onClick={onRetry}
          className="min-h-[11vh] rounded-full bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] px-[5vw] text-[2.8vw] font-black text-[#04222b] focus:outline-none focus-visible:ring-[0.6vw] focus-visible:ring-[#0e1419]/50"
        >
          {retry}
        </button>
      </div>
    </main>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <main dir="rtl" className={`fixed inset-0 grid place-items-center ${PAGE_BG}`}>
      <p role="status" className="text-[2.6vw] font-extrabold text-[#0284c7]">{text}</p>
    </main>
  );
}
