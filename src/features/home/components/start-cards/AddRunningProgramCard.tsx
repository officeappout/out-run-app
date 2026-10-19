'use client';

import type { UserFullProfile } from '@/types/user-profile';
import ProgramStartCard from './ProgramStartCard';
import { useOnboardingEntryTap } from './useOnboardingEntryTap';
import { PROGRAM_START_COPY } from './program-start-copy';

interface AddRunningProgramCardProps {
  profile: UserFullProfile | null | undefined;
  /** Home's health-declaration gate (interceptWorkoutStart), as for the strength card. */
  onNavigate?: (navigate: () => void) => void;
}

/** Home v2 (S-7b) — "תוכנית ריצה": starts the running onboarding. The strength twin is AddStrengthProgramCard (compact). */
export default function AddRunningProgramCard({ profile, onNavigate }: AddRunningProgramCardProps) {
  const { loading, tap } = useOnboardingEntryTap(profile, 'RUNNING', onNavigate);
  const copy = PROGRAM_START_COPY.running;
  return (
    <ProgramStartCard track="running" title={copy.title} valueLine={copy.valueLine} chipLabel={copy.chip} loading={loading} onTap={tap} />
  );
}
