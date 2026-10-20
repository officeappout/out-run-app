'use client';

/**
 * EntryWhatNowMount — the map's mount point for the entry flow's step 2 drawer
 * (enable_entry_whatnow_v1). DiscoverLayer renders it ONLY with the flag on and on an entry-v2
 * landing, so the Kelly-access read below never runs for anyone else (flag off = byte-identical).
 */
import EntryWhatNowHost, { type EntryWhatNowHostProps } from '@/features/user/onboarding/components/entry-whatnow/EntryWhatNowHost';
import { useAiCoachAccess } from '@/features/ai-coach/hooks/useAiCoachAccess';

export default function EntryWhatNowMount({
  kellyUnified, ...props
}: Omit<EntryWhatNowHostProps, 'kellyAvailable'> & { kellyUnified: boolean }) {
  const { canUseAi } = useAiCoachAccess();
  return <EntryWhatNowHost {...props} kellyAvailable={canUseAi || kellyUnified} />;
}
