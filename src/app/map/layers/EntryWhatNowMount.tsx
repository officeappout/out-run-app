'use client';

/**
 * EntryWhatNowMount — the map's mount point for the entry flow's step 2 drawer
 * (enable_entry_whatnow_v1). DiscoverLayer renders it ONLY with the flag on and on an entry-v2
 * landing (flag off = byte-identical).
 *
 * The "talk to Kelly" card shows only once Kelly is open to everyone (ai_coach_free_for_all).
 * Pilot 26.10 (L6): while Kelly is owner-only, the card confused new users, so entitlement or
 * the unified thread alone no longer show it.
 */
import EntryWhatNowHost, { type EntryWhatNowHostProps } from '@/features/user/onboarding/components/entry-whatnow/EntryWhatNowHost';

export default function EntryWhatNowMount({
  kellyOpenToAll, ...props
}: Omit<EntryWhatNowHostProps, 'kellyAvailable'> & { kellyOpenToAll: boolean }) {
  return <EntryWhatNowHost {...props} kellyAvailable={kellyOpenToAll} />;
}
