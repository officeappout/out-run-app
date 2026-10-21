'use client';

/**
 * The early push soft-ask screen (enable_home_v2) — shown once, right after
 * the track pick and before the identity step (EarlyPushSoftAskGate).
 * Presentational: the gate owns the OS prompt and the prefs.
 *
 *   <EarlyPushSoftAskScreen busy={busy} onAccept={…} onDefer={…} />
 *
 * One gradient CTA ("כן, תזכירו לי") + a quiet "לא עכשיו". No emoji.
 */
import { Bell, Loader2 } from 'lucide-react';
import { EARLY_SOFT_ASK_COPY, PUSH_SOFT_ASK_COPY } from '@/features/schedule/utils/pushReAsk';

export interface EarlyPushSoftAskScreenProps {
  busy: boolean;
  /** Must run the OS prompt as its first await (web gesture rule). */
  onAccept: () => void;
  onDefer: () => void;
}

export default function EarlyPushSoftAskScreen({ busy, onAccept, onDefer }: EarlyPushSoftAskScreenProps) {
  return (
    <div
      dir="rtl"
      className="mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top,0px))] w-full max-w-md flex-col bg-v2-surface font-simpler text-v2-ink"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div
          className="grid h-[140px] w-[140px] place-items-center rounded-full"
          style={{ background: 'radial-gradient(circle at 50% 45%, rgba(0,186,247,0.20), rgba(12,242,227,0.06) 62%, transparent 72%)' }}
          aria-hidden
        >
          <span className="grid h-[76px] w-[76px] place-items-center rounded-full bg-white text-v2-deep shadow-v2-card">
            <Bell size={36} strokeWidth={2.2} />
          </span>
        </div>
        <h1 className="mt-5 whitespace-nowrap text-[26px] font-black leading-[1.2] !tracking-[-0.02em]">{EARLY_SOFT_ASK_COPY.title}</h1>
        <p className="mt-2 max-w-[300px] text-[15px] font-bold leading-snug text-v2-ink-2">{EARLY_SOFT_ASK_COPY.body}</p>
      </div>

      <div className="px-4 pb-3 pt-3">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="flex h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16.5px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-80"
        >
          {busy && <Loader2 size={20} className="animate-spin" aria-hidden />}
          {PUSH_SOFT_ASK_COPY.accept}
        </button>
        <button
          type="button"
          onClick={onDefer}
          disabled={busy}
          className="mt-1 h-10 w-full whitespace-nowrap text-[15px] font-extrabold text-v2-muted transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          {PUSH_SOFT_ASK_COPY.defer}
        </button>
      </div>
    </div>
  );
}
