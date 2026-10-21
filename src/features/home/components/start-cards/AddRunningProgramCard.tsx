'use client';

import type { UserFullProfile } from '@/types/user-profile';
import ProgramStartCard from './ProgramStartCard';
import { useOnboardingEntryTap, type OnboardingEntryNavigate } from './useOnboardingEntryTap';
import { PROGRAM_START_KEYS } from './program-start-copy';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

interface AddRunningProgramCardProps {
  profile: UserFullProfile | null | undefined;
  /** Home's health-declaration gate (interceptWorkoutStart), as for the strength card. */
  onNavigate?: OnboardingEntryNavigate;
}

/** Home v2 (S-7b) — "תוכנית ריצה": starts the running onboarding. The strength twin is AddStrengthProgramCard (compact). */
export default function AddRunningProgramCard({ profile, onNavigate }: AddRunningProgramCardProps) {
  const { loading, tap } = useOnboardingEntryTap(profile, 'RUNNING', onNavigate);
  const t = useT(home);
  const keys = PROGRAM_START_KEYS.running;
  return (
    <ProgramStartCard track="running" title={t(keys.title)} valueLine={t(keys.valueLine)} chipLabel={t(keys.chip)} loading={loading} onTap={tap} />
  );
}
