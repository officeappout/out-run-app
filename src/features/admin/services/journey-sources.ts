/**
 * Journey → "מקורות הגעה" (where users came from). Pure aggregation over
 * data the route has already read, so it's unit-testable without Firestore.
 *
 * Owner decisions (15.10.2026, see the admin audit): acquisition shows
 * SOURCES, not the funnel; "activated" = a first real workout within 7 days
 * of signup; B2G users count like everyone else; Instagram sends people
 * straight to the store through smart links.
 *
 * A signup's channel, first match wins:
 *   1. invite   — the user appears as an invitee in `referrals`
 *   2. link     — marketingAttribution.linkId → that link's own channel
 *                 (website / instagram / qr / other links)
 *   3. source   — marketingAttribution.source 'instagram' / 'website'
 *   4. organic  — no known source (includes everyone the attribution
 *                 can't see yet: native installs, iOS)
 */

export type ChannelKey = 'website' | 'instagram' | 'qr' | 'links' | 'invites' | 'organic';

export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  website: 'אתר',
  instagram: 'אינסטגרם',
  qr: 'QR בשטח',
  links: 'קישורים אחרים',
  invites: 'הזמנות מחברים',
  organic: 'אורגני / לא ידוע',
};

export const CHANNEL_ORDER: ChannelKey[] = ['website', 'instagram', 'qr', 'links', 'invites', 'organic'];

/** days after signup within which a first real workout counts as activation */
export const ACTIVATION_DAYS = 7;

export interface SourceLink {
  id: string;
  name: string;
  utmSource: string | null;
  utmMedium: string | null;
  linkType: string | null;
  /** clicks inside the range (sum of daily_stats.total) */
  clicks: number;
}

export interface SourceUser {
  uid: string;
  createdAt: Date;
  source: string | null;
  linkId: string | null;
  /** date of the first real workout, if any */
  firstWorkoutAt: Date | null;
}

export interface WebDay {
  date: string; // YYYY-MM-DD
  sessions: number;
  downloadClicks: number;
  instagramSessions: number;
}

export interface JourneySourcesInput {
  from: Date;
  to: Date;
  users: SourceUser[]; // already filtered to real accounts created in [from, to]
  links: SourceLink[];
  inviteeUids: Set<string>;
  webDays: WebDay[];
}

export interface ChannelRow {
  key: ChannelKey;
  label: string;
  /** visits (website sessions / instagram-referred sessions) — null when the channel has no visit concept */
  visits: number | null;
  /** link/QR clicks attributed to the channel — null when not applicable */
  clicks: number | null;
  signups: number;
  activated: number;
}

export interface LinkRow {
  id: string;
  name: string;
  channel: ChannelKey;
  clicks: number;
  signups: number;
  activated: number;
}

export interface JourneySourcesResponse {
  range: { from: string; to: string };
  kpis: {
    webSessions: number;
    linkClicks: number;
    downloadClicks: number;
    signups: number;
    activated: number;
    /** % of signups with a known (non-organic) channel; null when no signups */
    knownSourcePct: number | null;
  };
  channels: ChannelRow[];
  links: LinkRow[];
  daily: Array<{ date: string; webSessions: number } & Record<ChannelKey, number>>;
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().trim();

/** which channel a smart link belongs to */
export function linkChannel(link: Pick<SourceLink, 'utmSource' | 'utmMedium' | 'linkType'>): ChannelKey {
  const src = norm(link.utmSource);
  const med = norm(link.utmMedium);
  if (src.includes('instagram') || src === 'ig') return 'instagram';
  if (src.includes('website') || src === 'site' || src.includes('outrun') || med === 'website') return 'website';
  if (link.linkType === 'qr_physical') return 'qr';
  return 'links';
}

/** a signup's channel (first match wins — see the header) */
export function userChannel(user: SourceUser, linksById: Map<string, SourceLink>, inviteeUids: Set<string>): ChannelKey {
  if (inviteeUids.has(user.uid)) return 'invites';
  if (user.linkId) {
    const link = linksById.get(user.linkId);
    if (link) return linkChannel(link);
    return 'links'; // a deleted/unknown link is still a link
  }
  const src = norm(user.source);
  if (src.includes('instagram') || src === 'ig') return 'instagram';
  if (src.includes('website') || src === 'site' || src.includes('outrun')) return 'website';
  return 'organic';
}

export function isActivated(user: SourceUser): boolean {
  if (!user.firstWorkoutAt) return false;
  const ms = user.firstWorkoutAt.getTime() - user.createdAt.getTime();
  return ms >= 0 && ms <= ACTIVATION_DAYS * 24 * 60 * 60 * 1000;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function daysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (d <= end && out.length < 400) {
    out.push(dayKey(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function aggregateJourneySources(input: JourneySourcesInput): JourneySourcesResponse {
  const linksById = new Map(input.links.map((l) => [l.id, l]));

  const channels = new Map<ChannelKey, ChannelRow>(
    CHANNEL_ORDER.map((k) => [k, { key: k, label: CHANNEL_LABELS[k], visits: null, clicks: null, signups: 0, activated: 0 }]),
  );
  const linkRows = new Map<string, LinkRow>(
    input.links.map((l) => [l.id, { id: l.id, name: l.name, channel: linkChannel(l), clicks: l.clicks, signups: 0, activated: 0 }]),
  );

  // clicks per channel (from the links themselves)
  for (const l of input.links) {
    const row = channels.get(linkChannel(l))!;
    row.clicks = (row.clicks ?? 0) + l.clicks;
  }

  // visits
  const webSessions = input.webDays.reduce((s, d) => s + d.sessions, 0);
  const igSessions = input.webDays.reduce((s, d) => s + d.instagramSessions, 0);
  channels.get('website')!.visits = webSessions;
  channels.get('instagram')!.visits = igSessions;

  // daily series
  const days = daysBetween(input.from, input.to);
  const daily = new Map(
    days.map((date) => [date, { date, webSessions: 0, website: 0, instagram: 0, qr: 0, links: 0, invites: 0, organic: 0 }]),
  );
  for (const d of input.webDays) {
    const row = daily.get(d.date);
    if (row) row.webSessions = d.sessions;
  }

  let activatedTotal = 0;
  let known = 0;
  for (const u of input.users) {
    const ch = userChannel(u, linksById, input.inviteeUids);
    const act = isActivated(u);
    const row = channels.get(ch)!;
    row.signups += 1;
    if (act) {
      row.activated += 1;
      activatedTotal += 1;
    }
    if (ch !== 'organic') known += 1;
    if (u.linkId && linkRows.has(u.linkId) && ch !== 'invites') {
      const lr = linkRows.get(u.linkId)!;
      lr.signups += 1;
      if (act) lr.activated += 1;
    }
    const dr = daily.get(dayKey(u.createdAt));
    if (dr) dr[ch] += 1;
  }

  const signups = input.users.length;
  return {
    range: { from: input.from.toISOString(), to: input.to.toISOString() },
    kpis: {
      webSessions,
      linkClicks: input.links.reduce((s, l) => s + l.clicks, 0),
      downloadClicks: input.webDays.reduce((s, d) => s + d.downloadClicks, 0),
      signups,
      activated: activatedTotal,
      knownSourcePct: signups > 0 ? Math.round((known / signups) * 1000) / 10 : null,
    },
    channels: CHANNEL_ORDER.map((k) => channels.get(k)!),
    links: Array.from(linkRows.values())
      .filter((l) => l.clicks > 0 || l.signups > 0)
      .sort((a, b) => b.signups - a.signups || b.clicks - a.clicks),
    daily: Array.from(daily.values()),
  };
}

const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;

/** ?from/?to → a sane range (default: the last 30 days, at most a year) */
export function parseRange(fromRaw: string | null, toRaw: string | null, now = new Date()): { from: Date; to: Date } {
  const to = toRaw ? new Date(toRaw) : now;
  const safeTo = Number.isNaN(to.getTime()) ? now : to;
  const fallbackFrom = new Date(safeTo.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
  const from = fromRaw ? new Date(fromRaw) : fallbackFrom;
  let safeFrom = Number.isNaN(from.getTime()) || from > safeTo ? fallbackFrom : from;
  const minFrom = new Date(safeTo.getTime() - MAX_DAYS * 24 * 60 * 60 * 1000);
  if (safeFrom < minFrom) safeFrom = minFrom;
  return { from: safeFrom, to: safeTo };
}
