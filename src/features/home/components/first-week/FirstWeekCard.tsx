'use client';

/**
 * Home v2 (enable_home_v2) — the first-week card, days 0–7 until the first
 * workout (owner-approved sequence, 21.10.2026). In-app only, unlimited; the
 * pushes are server-side (firstWorkoutScheduler). Day 0 is the welcome card
 * (Kelly's own welcome lives in her chat, when the user has Kelly). The
 * workout card right below is the main action, so this card has no gradient
 * CTA — only a white secondary pill when the day's lever has its own place
 * (a walk on the map, the park map, today's steps).
 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import { Chip } from '@/components/ui/v2';
import type { FirstWeekCard as FirstWeekCardData } from '@/features/notifications/first-week/first-week.core';
import { ProgramArt, ProgramTrackIcon } from '../start-cards/program-track-visual';
import { firstWeekArtTrack, firstWeekCardForProfile, firstWeekDismissKey, type FirstWeekArtTrack } from './first-week-home';

export interface FirstWeekCardProps {
  card: FirstWeekCardData;
  track: FirstWeekArtTrack;
  onDismiss: () => void;
}

const SIMPLER = { fontFamily: 'var(--font-simpler)' } as const;

export function firstWeekChipLabel(day: number): string {
  return day === 0 ? 'היום הראשון' : `השבוע הראשון · יום ${day}`;
}

export default function FirstWeekCard({ card, track, onDismiss }: FirstWeekCardProps) {
  const router = useRouter();
  return (
    <div
      className="relative w-full overflow-hidden rounded-v2-card bg-white shadow-v2-card"
      dir="rtl"
      role="status"
      data-first-week-card={card.day}
      data-first-week-lever={card.lever}
    >
      <div className="relative h-[92px]">
        <ProgramArt track={track} crop="wide" fade="70%" />
        <button
          type="button"
          onClick={onDismiss}
          aria-label="סגירה"
          className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline"
        >
          <X size={16} className="text-v2-ink-2" />
        </button>
      </div>
      <div className="px-4 pb-4 -mt-5 relative">
        <Chip tone="accent" className="!h-6 !px-2 !text-[11.5px] !font-extrabold">{firstWeekChipLabel(card.day)}</Chip>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
          <ProgramTrackIcon track={track} />
          <h3 className="truncate whitespace-nowrap text-[17px] font-black text-v2-ink" style={SIMPLER}>{card.title}</h3>
        </div>
        <p className="mt-1 text-[14px] font-medium leading-[1.45] text-v2-ink-2" style={SIMPLER}>{card.body}</p>
        {card.href && card.ctaLabel && (
          <button
            type="button"
            onClick={() => router.push(card.href!)}
            className="mt-3 inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-full bg-white px-4 text-[14px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            {card.ctaLabel}
            <ChevronLeft size={16} strokeWidth={2.6} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Self-contained home slot: computes today's card from the profile, handles the
 * per-day dismissal (browser storage, best effort), renders nothing otherwise.
 */
export function FirstWeekHomeCard({
  profile,
  doneToday = false,
}: {
  profile: Parameters<typeof firstWeekCardForProfile>[0];
  doneToday?: boolean;
}) {
  const card = firstWeekCardForProfile(profile, Date.now(), doneToday);
  const dismissKey = firstWeekDismissKey(profile?.id, card?.day ?? -1);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(dismissKey) === '1');
    } catch {
      setDismissed(false);
    }
  }, [dismissKey]);
  if (!card || dismissed) return null;
  return (
    <div className="px-4 mb-3">
      <FirstWeekCard
        card={card}
        track={firstWeekArtTrack(profile)}
        onDismiss={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(dismissKey, '1');
          } catch {
            // per-viewer convenience only
          }
        }}
      />
    </div>
  );
}
