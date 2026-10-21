/**
 * The translator the league boards' module-level helpers take as a parameter (i18n wave 2,
 * namespace `community`, `leagues.*` keys — docs/i18n/HOW-TO.md). Components get it from
 * `useT(community)` and pass it down.
 *
 * `leagueHeT()` is the default for callers that are not migrated yet (NeighborhoodLeaderboard,
 * ScopeCompetitionLeaderboard, ScopeBattleCard, NationalLeagueBoard, LeagueBoardSheets, CityArenaView,
 * app/community): it reads the HEBREW catalog — the same text as before, but Hebrew in every locale
 * until each caller passes its own `t`.
 */
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';
import { makeT } from '@/lib/i18n/t';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { community } from '@/messages/ns/community';

export type CommunityKey = NamespaceKey<typeof community>;
export type LeagueT = (key: CommunityKey, values?: MessageValues) => string;

export const leagueHeT = (): LeagueT => makeT(SOURCE_LOCALE, community);
