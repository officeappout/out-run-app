'use client';

/**
 * v2 planned-run card on the map (board R1-prop-preview, enable_home_v2):
 * type, then the shared overview header (human title · time · km · reps),
 * the shared journey strip (warm-up › 6 × 400 › cool-down), the intensity
 * profile, the 3-line structure, one gradient CTA and "פרטי האימון".
 */

import { ChevronUp, Play, X } from 'lucide-react';
import { IconButton, JourneyStrip, ProfileStrip, WorkoutOverviewHeader } from '@/components/ui/v2';
import type { RunPreviewModel } from '../../utils/run-preview/run-preview-model';
import RunKindTile from './RunKindIcon';

interface RunPreviewSheetV2Props {
  model: RunPreviewModel;
  onStart: () => void;
  onDetails: () => void;
  onClose: () => void;
}

export default function RunPreviewSheetV2({ model, onStart, onDetails, onClose }: RunPreviewSheetV2Props) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20" dir="rtl">
      <section
        aria-label="האימון המתוכנן"
        className="rounded-t-[28px] bg-white px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-v2-sheet"
      >
        <div className="flex justify-center pb-2 pt-2.5">
          <span className="h-1.5 w-10 rounded-full bg-v2-pill-border" />
        </div>

        <div className="flex items-center gap-3">
          <RunKindTile kind={model.kind} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate whitespace-nowrap text-[12.5px] font-extrabold" style={{ color: model.textColor }}>
              {model.typeLabel} · {model.weekLabelShort || 'אימון היום'}
            </p>
          </div>
          <IconButton aria-label="סגירה" tone="surface" size={36} onClick={onClose} className="shrink-0">
            <X className="h-4 w-4" strokeWidth={2.4} />
          </IconButton>
        </div>

        <div className="mt-2">
          <WorkoutOverviewHeader v2 title={model.title} meta={model.meta.map((text, i) => ({ key: `m${i}`, text }))} />
        </div>

        {model.journey.length > 0 && (
          <div className="-mx-5 mt-3 px-5">
            <JourneyStrip v2 items={model.journey} />
          </div>
        )}

        <ProfileStrip segments={model.strip} height={30} className="mt-3" />

        {model.lines.length > 0 && (
          <ul className="mt-3.5 flex flex-col gap-1.5">
            {model.lines.map((l) => (
              <li key={l.key} className="flex items-center gap-2.5 text-[13.5px] font-extrabold text-v2-ink">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color }} aria-hidden />
                <span className="min-w-0 truncate whitespace-nowrap">{l.text}</span>
                {l.side && (
                  <span
                    dir={l.sideIsPace ? 'ltr' : undefined}
                    className={`ms-auto shrink-0 whitespace-nowrap ${l.sideIsPace ? 'font-black text-v2-deep' : 'font-bold text-v2-muted'}`}
                  >
                    {l.side}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onStart}
            className="flex h-12 flex-[1.4] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <Play size={17} strokeWidth={2.6} fill="currentColor" />
            התחל אימון
          </button>
          <button
            type="button"
            onClick={onDetails}
            className="flex h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 text-[14px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <ChevronUp size={17} strokeWidth={2.4} />
            פרטי האימון
          </button>
        </div>
      </section>
    </div>
  );
}
