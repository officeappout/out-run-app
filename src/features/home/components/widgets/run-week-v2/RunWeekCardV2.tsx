'use client';

/**
 * One run of the week (board R1-prop-types, enable_home_v2): the kind's
 * colour + icon, type label, human title, state (done / today / day), and —
 * when the materialized workout is known (today's) — the journey strip,
 * the intensity profile and the header meta. Today is the selected card
 * (ring) and carries the screen's one gradient CTA.
 */

import type { ReactNode } from 'react';
import { Check, Play } from 'lucide-react';
import { JourneyStrip, ProfileStrip } from '@/components/ui/v2';
import RunKindTile from '@/features/workout-engine/players/running/components/preview-v2/RunKindIcon';
import type { RunKind } from '@/features/workout-engine/players/running/utils/run-preview/run-kind';
import { RUN_KIND_STYLE } from '@/features/workout-engine/players/running/utils/run-preview/run-kind';
import type { RunPreviewModel } from '@/features/workout-engine/players/running/utils/run-preview/run-preview-model';
import type { RunWeekRowState } from '@/features/workout-engine/players/running/utils/run-preview/run-week';

export interface RunWeekCardV2Props {
  kind: RunKind;
  typeLabel: string;
  title: string;
  state: RunWeekRowState;
  dayLetter: string | null;
  /** Today's materialized workout, when loaded. */
  model?: RunPreviewModel | null;
  onStart?: () => void;
  /** Optional overrides for a non-run activity on the same card (the walk card):
   *  the leading tile, the type label colour and the CTA label. Defaults = the run kind's. */
  tile?: ReactNode;
  accentText?: string;
  startLabel?: string;
  /** Extra rows under the header (e.g. the walk's goal + step ring). */
  children?: ReactNode;
}

export default function RunWeekCardV2({
  kind, typeLabel, title, state, dayLetter, model, onStart, tile, accentText, startLabel = 'התחל', children,
}: RunWeekCardV2Props) {
  const today = state === 'today';
  const style = RUN_KIND_STYLE[kind];
  return (
    <article
      className={`rounded-[22px] bg-white px-3.5 pb-3 pt-3.5 ${today ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'}`}
      aria-current={today ? 'true' : undefined}
    >
      <div className="flex items-center gap-2.5">
        {tile ?? <RunKindTile kind={kind} size={40} />}
        <div className="min-w-0 flex-1">
          <p className="truncate whitespace-nowrap text-[12px] font-extrabold" style={{ color: accentText ?? style.text }}>
            {today ? `${typeLabel} · היום` : typeLabel}
          </p>
          <h3 className={`truncate whitespace-nowrap text-[16.5px] font-black ${state === 'done' || state === 'skipped' ? 'text-v2-ink-2' : 'text-v2-ink'}`}>
            {title}
          </h3>
        </div>
        {state === 'done' && (
          <span className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-v2-tint px-2.5 text-[12px] font-extrabold text-v2-deep">
            <Check size={13} strokeWidth={2.8} aria-hidden />
            בוצע
          </span>
        )}
        {state === 'skipped' && (
          <span className="shrink-0 whitespace-nowrap text-[12px] font-extrabold text-v2-muted">דילגת</span>
        )}
        {today && onStart && (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-v2-cta px-3 text-[13px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <Play size={13} strokeWidth={2.6} fill="currentColor" aria-hidden />
            {startLabel}
          </button>
        )}
        {state === 'upcoming' && dayLetter && (
          <span className="shrink-0 whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{dayLetter}</span>
        )}
      </div>

      {model && (
        <>
          {model.journey.length > 0 && (
            <div className="mt-2.5">
              <JourneyStrip v2 items={model.journey} />
            </div>
          )}
          <ProfileStrip segments={model.strip} height={22} className="mt-2.5" />
          {model.meta.length > 0 && (
            <p className="mt-2 flex gap-3 whitespace-nowrap text-[12px] font-extrabold text-v2-ink-2">
              {model.meta.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </p>
          )}
        </>
      )}
      {children}
    </article>
  );
}
