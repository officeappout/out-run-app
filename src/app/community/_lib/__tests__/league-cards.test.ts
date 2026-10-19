import { describe, it, expect } from 'vitest';
import type { CommunityGroup } from '@/types/community.types';
import type { LeaderboardEntry } from '@/features/arena/services/ranking.service';
import { buildLeagueCards, type LeagueCardsInput } from '../league-cards';

const access = (patch: Partial<LeagueCardsInput['access']> = {}): LeagueCardsInput['access'] =>
  ({
    hasCityAccess: true,
    cityName: 'חיפה',
    orgType: null,
    orgName: null,
    preferredParkId: null,
    preferredParkName: null,
    hasReserveAccess: false,
    ...patch,
  }) as LeagueCardsInput['access'];

const input = (patch: Partial<LeagueCardsInput> = {}): LeagueCardsInput => ({
  access: access(),
  authority: { id: 'c1', logoUrl: 'https://x/l.png', userCount: 420 } as LeagueCardsInput['authority'],
  selectedLeague: 'city',
  activeMyEntry: { rank: 7 } as LeaderboardEntry,
  socialGroups: [],
  ...patch,
});

describe('buildLeagueCards', () => {
  it('city → global, with the rank on the selected card only', () => {
    const cards = buildLeagueCards(input());
    expect(cards.map((c) => c.key)).toEqual(['city', 'global']);
    expect(cards[0]).toMatchObject({ name: 'ליגת העיר', subtitle: 'חיפה', logoUrl: 'https://x/l.png', memberCount: 420, rank: 7 });
    expect(cards[1]).toMatchObject({ name: 'ליגה ארצית', memberCount: null, rank: null });
  });

  it('no city access → global first', () => {
    const cards = buildLeagueCards(input({ access: access({ hasCityAccess: false }), selectedLeague: 'global' }));
    expect(cards.map((c) => c.key)).toEqual(['global']);
    expect(cards[0].rank).toBe(7);
  });

  it('org card name / emoji per org type', () => {
    const name = (orgType: string) =>
      buildLeagueCards(input({ access: access({ orgType: orgType as never, orgName: 'אורג' }) })).find((c) => c.key === 'org');
    expect(name('work')).toMatchObject({ name: 'ליגת העבודה', emoji: '🏢', subtitle: 'אורג' });
    expect(name('university')).toMatchObject({ name: 'ליגת הקמפוס', emoji: '🎓' });
    expect(name('youth_movement')).toMatchObject({ name: 'ליגת התנועה', emoji: '⛺' });
    expect(name('school')).toMatchObject({ name: 'ליגת בית הספר', emoji: '🏫' });
  });

  it('park league stays hidden; reserve card only with reserve access', () => {
    const park = buildLeagueCards(input({ access: access({ preferredParkId: 'p1', preferredParkName: 'גן' }) }));
    expect(park.some((c) => c.key === 'park')).toBe(false);
    const reserve = buildLeagueCards(input({ access: access({ hasReserveAccess: true }), selectedLeague: 'reserve' }));
    expect(reserve.find((c) => c.key === 'reserve')).toMatchObject({ name: 'ליגת המילואים', rank: 7 });
  });

  it('one card per social group, emoji by type', () => {
    const groups = [
      { id: 'a', name: 'משפחה', groupType: 'family', memberCount: 5 },
      { id: 'b', name: 'חברים', groupType: 'friends' },
      { id: 'c', name: 'שכונה', groupType: 'neighborhood' },
      { id: 'd', name: 'פארק', groupType: 'park' },
      { id: 'e', name: 'אחר' },
    ] as unknown as CommunityGroup[];
    const cards = buildLeagueCards(input({ socialGroups: groups, selectedLeague: 'league_b' })).slice(2);
    expect(cards.map((c) => [c.key, c.emoji])).toEqual([
      ['league_a', '👨‍👩‍👧'], ['league_b', '👥'], ['league_c', '🏘️'], ['league_d', '🌳'], ['league_e', '🏃'],
    ]);
    expect(cards[0]).toMatchObject({ subtitle: '5 חברים', memberCount: 5, rank: null });
    expect(cards[1]).toMatchObject({ subtitle: undefined, memberCount: null, rank: 7 });
  });
});
