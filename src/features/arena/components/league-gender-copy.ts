/**
 * NeighborhoodLeaderboard copy — male / female / neutral (gender batch 2, owner decisions 21.10.2026;
 * src/lib/i18n/gender-copy.ts).
 *
 * i18n wave 2 batch x: the text now lives in the `community` catalog (`leagues.individual.*`, a
 * `{gender, select}` per entry). The board renders `t(LEAGUE_COPY_KEYS[id])`; LEAGUE_COPY stays as
 * the male / female / other view of the same HEBREW catalog entries (gender-batch2.test.ts reads it).
 */
import type { GenderedText } from '@/lib/i18n/gender-copy';
import { leagueHeT, type CommunityKey } from './league-t';

export const LEAGUE_COPY_KEYS = {
  stepTrain: 'leagues.individual.steps.train',
  stepInvite: 'leagues.individual.steps.invite',
  stepPodium: 'leagues.individual.steps.podium',
  lockedInvite: 'leagues.individual.locked.invite',
  lockedCity: 'leagues.individual.locked.city',
} as const satisfies Record<string, CommunityKey>;

const he = leagueHeT();
const gendered = (key: CommunityKey): GenderedText => ({
  male: he(key, { gender: 'male' }),
  female: he(key, { gender: 'female' }),
  other: he(key, { gender: 'other' }),
});

/** Gender batch 2 (21.10.2026): these were masculine for everyone. other = neutral. */
export const LEAGUE_COPY = {
  stepTrain: gendered(LEAGUE_COPY_KEYS.stepTrain),
  stepInvite: gendered(LEAGUE_COPY_KEYS.stepInvite),
  stepPodium: gendered(LEAGUE_COPY_KEYS.stepPodium),
  lockedInvite: gendered(LEAGUE_COPY_KEYS.lockedInvite),
  lockedCity: gendered(LEAGUE_COPY_KEYS.lockedCity),
} satisfies Record<keyof typeof LEAGUE_COPY_KEYS, GenderedText>;
