'use client';

/**
 * The exercise page's v2 (enable_home_v2) building blocks, shared so other
 * detail sheets look the same (the park's equipment drawer): a numbered
 * step, a key-fact tile, the muscles strip and a level node of the
 * progression strip. Moved verbatim out of MasterExerciseView — render-only,
 * the caller passes its own (translated) labels.
 */

import type { ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import type { MuscleGroup } from '../../../core/exercise.types';
import { MUSCLE_ICON_PATHS, MUSCLE_FALLBACK_ICON } from '@/lib/muscle-icons.const';
import { getMuscleGroupLabel } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

import { DETAIL_IMAGE_PLACEHOLDER, DETAIL_SECTION_FONT } from './detail-v2-tokens';

export * from './detail-v2-tokens';

/** One numbered step row (v2) — tint numeral, never a filled black/brand disc. */
export function V2Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-v2-tint text-[13px] font-black tabular-nums text-v2-deep ring-1 ring-inset ring-v2-accent/40">
        {n}
      </span>
      <span className="flex-1 pt-[3px] text-[14.5px] leading-relaxed text-v2-ink-2" style={DETAIL_SECTION_FONT}>
        {children}
      </span>
    </li>
  );
}

/** v2 key-fact tile (muscle / equipment / level). */
export function V2FactTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5 rounded-[18px] bg-white px-3 py-2.5 shadow-v2-ring">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-v2-tint text-v2-deep">{icon}</span>
      <span className="whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{label}</span>
      <span className="w-full truncate whitespace-nowrap text-[13.5px] font-extrabold text-v2-ink" style={DETAIL_SECTION_FONT}>
        {value}
      </span>
    </div>
  );
}

/** v2 anatomy strip — primary (tint) + secondary tiles in one horizontal row. */
export function V2MuscleStrip({
  primary, secondary, primaryLabel, secondaryLabel,
}: {
  primary: MuscleGroup | null | undefined;
  secondary: readonly MuscleGroup[];
  primaryLabel: string;
  secondaryLabel: string;
}) {
  return (
    <div className="-mx-4 flex flex-row items-stretch gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
      {[...(primary ? [primary] : []), ...secondary].map((m, i) => {
        const isPrimary = !!primary && i === 0;
        return (
          <div
            key={m}
            className={`flex w-[84px] flex-shrink-0 flex-col items-center gap-1.5 rounded-[18px] px-2 py-2.5 ${
              isPrimary ? 'bg-v2-tint ring-1 ring-inset ring-v2-accent/40' : 'bg-white shadow-v2-ring'
            }`}
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={MUSCLE_ICON_PATHS[m] ?? MUSCLE_FALLBACK_ICON}
                alt=""
                className="max-h-full max-w-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <span
              className={`w-full truncate whitespace-nowrap text-center text-[12px] font-extrabold ${isPrimary ? 'text-v2-deep' : 'text-v2-ink-2'}`}
              style={DETAIL_SECTION_FONT}
            >
              {getMuscleGroupLabel(m)}
            </span>
            <span className="whitespace-nowrap text-[11px] font-bold text-v2-muted">
              {isPrimary ? primaryLabel : secondaryLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** One node of the v2 progression strip: thumbnail, level line, name. */
export function V2LevelNode({
  thumb, name, levelLabel, current = false, completed = false, locked = false,
}: {
  thumb: string;
  name: string;
  levelLabel: string;
  current?: boolean;
  completed?: boolean;
  locked?: boolean;
}) {
  const size = current ? 88 : 72;
  return (
    <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <div className="grid h-[88px] place-items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className={`h-full w-full overflow-hidden rounded-[22px] ${locked ? 'bg-v2-tint' : 'bg-white'} ${
            current
              ? 'shadow-v2-float ring-[3px] ring-v2-accent'
              : completed
                ? 'shadow-v2-card ring-2 ring-v2-accent/50'
                : 'shadow-v2-ring ring-[3px] ring-white'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            style={locked ? { filter: 'grayscale(70%) saturate(0.8)', opacity: 0.72 } : undefined}
            onError={(e) => { (e.target as HTMLImageElement).src = DETAIL_IMAGE_PLACEHOLDER; }}
          />
        </div>
        {locked && (
          <div className="absolute bottom-1.5 left-1/2 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full bg-white/95 text-v2-muted shadow-v2-ring">
            <Lock size={12} strokeWidth={2.5} />
          </div>
        )}
        {completed && !locked && (
          <div className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-v2-accent text-white shadow-v2-card ring-2 ring-white">
            <Check size={12} strokeWidth={3} />
          </div>
        )}
      </div>
      </div>
      <span className={`whitespace-nowrap text-[11.5px] font-extrabold ${current ? 'text-v2-deep' : 'text-v2-muted'}`}>
        {levelLabel}
      </span>
      <span
        className={`w-full truncate whitespace-nowrap text-center text-[12.5px] font-extrabold ${locked ? 'text-v2-muted' : 'text-v2-ink'}`}
        style={DETAIL_SECTION_FONT}
        title={name}
      >
        {name}
      </span>
    </div>
  );
}
