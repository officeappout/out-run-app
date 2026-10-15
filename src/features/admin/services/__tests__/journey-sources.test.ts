import { describe, it, expect } from 'vitest';
import {
  aggregateJourneySources,
  isActivated,
  linkChannel,
  userChannel,
  type SourceLink,
  type SourceUser,
} from '../journey-sources';

const day = (d: string) => new Date(`${d}T10:00:00Z`);

const LINKS: SourceLink[] = [
  { id: 'site-home', name: 'אתר — דף בית', utmSource: 'website', utmMedium: 'cta', linkType: 'web', clicks: 40 },
  { id: 'ig-bio', name: 'ביו אינסטגרם', utmSource: 'instagram', utmMedium: 'bio', linkType: 'web', clicks: 25 },
  { id: 'park-qr', name: 'QR גינה', utmSource: 'qr', utmMedium: 'print', linkType: 'qr_physical', clicks: 9 },
  { id: 'partner', name: 'שותף', utmSource: 'partner', utmMedium: null, linkType: 'partner', clicks: 3 },
];

describe('linkChannel', () => {
  it('classifies site, instagram, qr and other links', () => {
    expect(linkChannel(LINKS[0])).toBe('website');
    expect(linkChannel(LINKS[1])).toBe('instagram');
    expect(linkChannel(LINKS[2])).toBe('qr');
    expect(linkChannel(LINKS[3])).toBe('links');
  });
});

describe('userChannel — first match wins', () => {
  const byId = new Map(LINKS.map((l) => [l.id, l]));
  const u = (p: Partial<SourceUser>): SourceUser => ({ uid: 'u', createdAt: day('2026-10-01'), source: null, linkId: null, firstWorkoutAt: null, ...p });

  it('an invitee is an invite even if they also carry a link', () => {
    expect(userChannel(u({ uid: 'inv', linkId: 'ig-bio' }), byId, new Set(['inv']))).toBe('invites');
  });
  it('a link wins over the utm source', () => {
    expect(userChannel(u({ linkId: 'park-qr', source: 'instagram' }), byId, new Set())).toBe('qr');
  });
  it('an unknown/deleted link still counts as a link', () => {
    expect(userChannel(u({ linkId: 'gone' }), byId, new Set())).toBe('links');
  });
  it('falls back to the utm source, then organic', () => {
    expect(userChannel(u({ source: 'Instagram' }), byId, new Set())).toBe('instagram');
    expect(userChannel(u({ source: 'website' }), byId, new Set())).toBe('website');
    expect(userChannel(u({ source: 'organic' }), byId, new Set())).toBe('organic');
    expect(userChannel(u({}), byId, new Set())).toBe('organic');
  });
});

describe('isActivated — first real workout within 7 days', () => {
  const base = { uid: 'u', source: null, linkId: null };
  it('day 0 and day 7 count; day 8 and none do not', () => {
    expect(isActivated({ ...base, createdAt: day('2026-10-01'), firstWorkoutAt: day('2026-10-01') })).toBe(true);
    expect(isActivated({ ...base, createdAt: day('2026-10-01'), firstWorkoutAt: day('2026-10-08') })).toBe(true);
    expect(isActivated({ ...base, createdAt: day('2026-10-01'), firstWorkoutAt: day('2026-10-09') })).toBe(false);
    expect(isActivated({ ...base, createdAt: day('2026-10-01'), firstWorkoutAt: null })).toBe(false);
  });
});

describe('aggregateJourneySources', () => {
  const users: SourceUser[] = [
    { uid: 'a', createdAt: day('2026-10-02'), source: 'website', linkId: 'site-home', firstWorkoutAt: day('2026-10-03') },
    { uid: 'b', createdAt: day('2026-10-02'), source: 'instagram', linkId: 'ig-bio', firstWorkoutAt: null },
    { uid: 'c', createdAt: day('2026-10-03'), source: null, linkId: null, firstWorkoutAt: day('2026-10-20') },
    { uid: 'd', createdAt: day('2026-10-03'), source: null, linkId: null, firstWorkoutAt: day('2026-10-04') },
  ];
  const result = aggregateJourneySources({
    from: day('2026-10-01'),
    to: day('2026-10-05'),
    users,
    links: LINKS,
    inviteeUids: new Set(['d']),
    webDays: [
      { date: '2026-10-02', sessions: 120, downloadClicks: 14, instagramSessions: 30 },
      { date: '2026-10-03', sessions: 80, downloadClicks: 6, instagramSessions: 5 },
    ],
  });

  it('KPIs', () => {
    expect(result.kpis).toEqual({ webSessions: 200, linkClicks: 77, downloadClicks: 20, signups: 4, activated: 2, knownSourcePct: 75 });
  });

  it('channel rows: signups, activation, clicks and visits', () => {
    const by = Object.fromEntries(result.channels.map((c) => [c.key, c]));
    expect(by.website).toMatchObject({ visits: 200, clicks: 40, signups: 1, activated: 1 });
    expect(by.instagram).toMatchObject({ visits: 35, clicks: 25, signups: 1, activated: 0 });
    expect(by.invites).toMatchObject({ visits: null, clicks: null, signups: 1, activated: 1 });
    expect(by.organic).toMatchObject({ signups: 1, activated: 0 }); // c worked out on day 17 → not activated
    expect(result.channels.map((c) => c.key)).toEqual(['website', 'instagram', 'qr', 'links', 'invites', 'organic']);
  });

  it('link rows carry their own signups, sorted by signups then clicks; idle links hidden', () => {
    expect(result.links.map((l) => [l.id, l.signups, l.clicks])).toEqual([
      ['site-home', 1, 40],
      ['ig-bio', 1, 25],
      ['park-qr', 0, 9],
      ['partner', 0, 3],
    ]);
  });

  it('daily series covers every day in range, with web sessions and per-channel signups', () => {
    expect(result.daily.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    const oct2 = result.daily[1];
    expect(oct2).toMatchObject({ webSessions: 120, website: 1, instagram: 1 });
    expect(result.daily[2]).toMatchObject({ webSessions: 80, organic: 1, invites: 1 });
  });

  it('no signups → knownSourcePct is null, not 0', () => {
    const empty = aggregateJourneySources({ from: day('2026-10-01'), to: day('2026-10-01'), users: [], links: [], inviteeUids: new Set(), webDays: [] });
    expect(empty.kpis.knownSourcePct).toBeNull();
  });
});
