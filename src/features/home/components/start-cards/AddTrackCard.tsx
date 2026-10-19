'use client';

import { Loader2 } from 'lucide-react';
import type { UserFullProfile } from '@/types/user-profile';
import type { ProgramTrack } from '@/features/home/utils/program-start-cards';
import { PROGRAM_TRACK_VISUAL } from './ProgramStartCard';
import { useOnboardingEntryTap } from './useOnboardingEntryTap';
import { ADD_TRACK_CTA, ADD_TRACK_DISMISS, PROGRAM_START_COPY } from './program-start-copy';

interface AddTrackCardProps {
  /** The track the user does NOT have yet. */
  track: ProgramTrack;
  profile: UserFullProfile | null | undefined;
  onNavigate?: (navigate: () => void) => void;
  /** "לא עכשיו" — the caller hides the card (14 days, local). */
  onDismiss: () => void;
}

/**
 * Home v2 (S-7c / S-7d / S-6d) — after one track exists, the other one's
 * "רוצה להוסיף …?" slide. "בוא נוסיף" starts that track's onboarding;
 * "לא עכשיו" hides it. Sized to its content inside the carousel slot, the
 * same way AddStrengthProgramCard sits there.
 */
export default function AddTrackCard({ track, profile, onNavigate, onDismiss }: AddTrackCardProps) {
  const { loading, tap } = useOnboardingEntryTap(profile, track === 'running' ? 'RUNNING' : 'STRENGTH', onNavigate);
  const copy = PROGRAM_START_COPY[track];
  const visual = PROGRAM_TRACK_VISUAL[track];
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        data-add-track={track}
        className="flex w-full flex-col gap-1.5 rounded-v2-card bg-white p-4 text-right shadow-v2-card"
        dir="rtl"
      >
        <span
          className="grid h-10 w-10 place-items-center rounded-[14px]"
          style={{ backgroundColor: `${visual.color}22` }}
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={visual.icon} alt="" className="h-5 w-5 object-contain" />
        </span>
        <h3 className="whitespace-nowrap text-[17px] font-black text-v2-ink">{copy.addTitle}</h3>
        <p className="text-[13px] font-bold leading-[1.45] text-v2-muted">{copy.addBody}</p>
        <button
          type="button"
          onClick={tap}
          disabled={loading}
          className="mt-2 flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white text-[14px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {ADD_TRACK_CTA}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="mx-auto h-8 whitespace-nowrap px-3 text-[12.5px] font-bold text-v2-muted"
        >
          {ADD_TRACK_DISMISS}
        </button>
      </div>
    </div>
  );
}
