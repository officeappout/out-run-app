'use client';

import type { UserFullProfile } from '@/types/user-profile';
import type { ProgramTrack } from '@/features/home/utils/program-start-cards';
import ProgramStartCard from './ProgramStartCard';
import { PROGRAM_START_KEYS } from './program-start-copy';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { useOnboardingEntryTap } from './useOnboardingEntryTap';
import type { ProgramTrackNavigate } from './entry-tap';
import { PROGRAM_CARD_ENTRY } from './program-signup-gate';

const TRACK_ENTRY = { strength: 'STRENGTH', running: 'RUNNING' } as const;

export interface ProgramStartSlideProps {
  track: ProgramTrack;
  profile: UserFullProfile | null | undefined;
  /** Home's health-declaration gate, per track. */
  onNavigate?: ProgramTrackNavigate;
}

/**
 * Home v2 (owner 20.10.2026) — ONE questionnaire start card as a whole carousel slide: full
 * card width, all its text visible. The running card is also the walk entry (walking is a
 * goal inside the aerobic questionnaire, #534).
 */
export default function ProgramStartSlide({ track, profile, onNavigate }: ProgramStartSlideProps) {
  const { loading, tap } = useOnboardingEntryTap(
    profile,
    TRACK_ENTRY[track],
    onNavigate ? (navigate, cancel) => onNavigate(track, navigate, cancel) : undefined,
    PROGRAM_CARD_ENTRY,
  );
  const t = useT(home);
  const keys = PROGRAM_START_KEYS[track];
  return <ProgramStartCard slide track={track} title={t(keys.title)} valueLine={t(keys.valueLine)} chipLabel={t(keys.chip)} loading={loading} onTap={tap} />;
}
