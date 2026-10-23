'use client';

import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { useTogetherLocale } from '../hooks/useTogetherLocale';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { localizeParams } from '../core/localize';
import { explainDecision, type TogetherDecision } from '../core/level-similarity';
import type { CountdownView } from '../core/countdown';
import type { LobbyPerson } from '../core/lobby-roster';

export interface TogetherLobbyPanelProps {
  groupName: string;
  people: LobbyPerson[];
  decision: TogetherDecision;
  countdown: CountdownView;
  isHost: boolean;
  starting?: boolean;
  shareReady?: boolean;
  onStart: () => void;
  onShare?: () => void;
}

/**
 * The together waiting room (presentational): who is in with a "here" tick, the
 * one-line "system chose" explanation (no same/each toggle), the host's
 * "מתחילים יחד" and the 3-2-1 synced from a server timestamp.
 */
export default function TogetherLobbyPanel(props: TogetherLobbyPanelProps) {
  const t = useT(together);
  const { dir, locale } = useTogetherLocale();
  const { key, params } = explainDecision(props.decision);

  if (props.countdown.phase === 'counting') {
    return (
      <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 text-center" dir={dir} role="status" aria-live="assertive">
        <p className="mb-2 text-sm font-semibold text-white/70">{t('lobby.countdownLabel')}</p>
        <div className="text-8xl font-black tabular-nums text-white">{formatNumber(props.countdown.digit, locale)}</div>
      </div>
    );
  }
  if (props.countdown.phase === 'go') {
    return (
      <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70" dir={dir} role="status">
        <p className="text-4xl font-black text-white">{t('lobby.go')}</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-black/80" dir={dir}>
      <div className="px-5 pb-3 pt-16">
        <p className="mb-1 text-xs font-semibold tracking-widest text-white/60">{t('lobby.title')}</p>
        <h2 className="text-2xl font-black text-white">{props.groupName}</h2>
        <p className="mt-2 rounded-2xl bg-white/10 px-3 py-2 text-[13px] leading-snug text-white" data-testid="together-explain">
          {t(key, localizeParams(params, locale))}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5">
        <p className="mb-2 text-xs font-semibold text-white/50">{t('lobby.who')}</p>
        <ul className="flex flex-col gap-3">
          {props.people.map((p) => (
            <li key={p.uid} className="flex items-center gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20 text-sm font-bold text-white">
                {p.photoURL ? <img src={p.photoURL} alt="" className="h-full w-full object-cover" /> : (p.name.charAt(0) || '·')}
              </span>
              <span className="text-sm font-medium text-white">{p.name}</span>
              {p.isMe && <span className="text-xs text-white/50">{t('lobby.me')}</span>}
              {p.here && <span className="ms-auto rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">{t('lobby.here')}</span>}
            </li>
          ))}
          {props.people.length === 0 && <li className="text-sm text-white/40">{t('lobby.empty')}</li>}
        </ul>
      </div>

      <div className="flex flex-col gap-3 px-5 pb-12 pt-4">
        {props.isHost ? (
          <>
            {props.shareReady && props.onShare && (
              <button onClick={props.onShare} className="w-full rounded-2xl bg-white/15 py-3 text-sm font-semibold text-white">
                {t('lobby.shareLink')}
              </button>
            )}
            <button onClick={props.onStart} disabled={props.starting} className="w-full rounded-2xl bg-white py-4 text-lg font-black text-black disabled:opacity-50">
              {props.starting ? t('lobby.starting') : t('lobby.start')}
            </button>
          </>
        ) : (
          <div className="w-full rounded-2xl bg-white/10 py-4 text-center text-sm font-semibold text-white/60">{t('lobby.waitHost')}</div>
        )}
      </div>
    </div>
  );
}
