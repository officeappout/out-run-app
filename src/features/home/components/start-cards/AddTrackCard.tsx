'use client';

import { Loader2 } from 'lucide-react';
import type { UserFullProfile } from '@/types/user-profile';
import type { ProgramTrack } from '@/features/home/utils/program-start-cards';
import { ProgramArt, ProgramTrackIcon } from './program-track-visual';
import { useOnboardingEntryTap, type OnboardingEntryNavigate } from './useOnboardingEntryTap';
import { PROGRAM_CARD_ENTRY } from './program-signup-gate';
import { ADD_TRACK_CTA, ADD_TRACK_DISMISS, PROGRAM_START_COPY } from './program-start-copy';

interface AddTrackCardProps {
  /** The track the user does NOT have yet. */
  track: ProgramTrack;
  profile: UserFullProfile | null | undefined;
  onNavigate?: OnboardingEntryNavigate;
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
  const { loading, tap } = useOnboardingEntryTap(profile, track === 'running' ? 'RUNNING' : 'STRENGTH', onNavigate, PROGRAM_CARD_ENTRY);
  const copy = PROGRAM_START_COPY[track];
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        data-add-track={track}
        className="flex w-full flex-col overflow-hidden rounded-[24px] bg-white text-right shadow-lg"
        dir="rtl"
      >
        <div className="relative h-[124px] w-full">
          <ProgramArt track={track} crop="wide" fade="70%" />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-4 pb-1">
            <ProgramTrackIcon track={track} />
            <h3 className="whitespace-nowrap text-xl font-bold text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
              {copy.addTitle}
            </h3>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 px-4 pb-3">
          <p className="text-[13px] font-medium leading-[1.45] text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>{copy.addBody}</p>
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
    </div>
  );
}
