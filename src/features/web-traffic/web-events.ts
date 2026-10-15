/**
 * Web traffic — the marketing site's (outrun.co.il/web) anonymous events,
 * shared shape + pure normalisation (no Firebase imports: used by the ingest
 * route, the admin read route and tests).
 *
 * The site sends tiny events with `navigator.sendBeacon('/api/telemetry/web')`
 * (same origin through the /web multi-zone rewrite, no cookies):
 *   pv     — a page view; `s: 1` on the first view of a browser session (a
 *            random id in sessionStorage on the site, never sent), which is
 *            when source / campaign / landing / device / country are counted
 *   cta    — a click on a tracked call-to-action (closed list below)
 *   scroll — the deepest 25/50/75/100% reached on a page (once per page view)
 *
 * No PII: no IP (only a rate-limit key), no user id, no cookies, the referrer
 * reduced to its host, UTM values truncated, paths normalised to a bounded
 * set of keys.
 */

export const WEB_CTA_TARGETS = [
  'appstore',
  'play',
  'onelink',
  'whatsapp',
  'email',
  'phone',
  'instagram',
  'press',
  'community',
  'demo',
] as const;
export type WebCtaTarget = (typeof WEB_CTA_TARGETS)[number];
export const WEB_SCROLL_DEPTHS = [25, 50, 75, 100] as const;

/** What the site sends (short keys keep the beacon tiny). */
export interface RawWebEvent {
  t?: unknown; // 'pv' | 'cta' | 'scroll'
  p?: unknown; // path, e.g. "/web/he/strength"
  l?: unknown; // locale
  s?: unknown; // 1 = first page view of the session
  r?: unknown; // document.referrer (full; reduced to host here)
  us?: unknown; // utm_source
  um?: unknown; // utm_medium
  uc?: unknown; // utm_campaign
  x?: unknown; // cta target
  d?: unknown; // scroll depth
}

export type WebEvent =
  | { type: 'pv'; pathKey: string; locale: string; newSession: boolean; source: string; medium: string | null; campaign: string | null }
  | { type: 'cta'; pathKey: string; locale: string; target: WebCtaTarget }
  | { type: 'scroll'; pathKey: string; locale: string; depth: number };

const SITE_HOSTS = ['outrun.co.il', 'www.outrun.co.il', 'localhost'];

/** Firestore map keys: keep them short and free of path separators. */
export function toKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\./g, '·')
    .replace(/\//g, '|')
    .replace(/[\[\]#$*`~\s]+/g, '-')
    .slice(0, 60);
}
/** Back to a readable label for the admin screen. */
export function fromKey(k: string): string {
  return k.replace(/·/g, '.').replace(/\|/g, '/');
}

/** "/web/he/learn/abc123?x" → "he/learn/:exercise"; "/web" → "home". Bounded key set. */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/web')) return null;
  let p = raw.split(/[?#]/)[0].replace(/^\/web\/?/, '').replace(/\/+$/, '');
  if (!p) return 'home';
  const parts = p.split('/').filter(Boolean).slice(0, 4);
  // exercise pages are /<locale>/learn/<firestore id> — one bucket for all
  if (parts[1] === 'learn' && parts[2] && parts[2] !== 'articles') parts.splice(2, 2, ':exercise');
  p = parts.join('/');
  return toKey(p) || 'home';
}

function shortText(v: unknown, max = 40): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? toKey(t.slice(0, max)) : null;
}

/** The referrer's host only ("l.instagram.com" → "instagram.com"); null for our own site / none. */
export function referrerHost(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    let host = new URL(raw).hostname.toLowerCase();
    if (SITE_HOSTS.includes(host) || host.endsWith('.vercel.app')) return null;
    host = host.replace(/^(www|m|l|lm)\./, '');
    return host;
  } catch {
    return null;
  }
}

/** Validates + reduces a raw beacon to a WebEvent, or null (dropped). */
export function normalizeWebEvent(raw: RawWebEvent | null | undefined): WebEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const pathKey = normalizePath(raw.p);
  if (!pathKey) return null;
  // the site sends it; the path's first segment is the fallback
  const locale = raw.l === 'en' || (raw.l == null && /^en($|\|)/.test(pathKey)) ? 'en' : 'he';

  if (raw.t === 'pv') {
    const utmSource = shortText(raw.us);
    const host = referrerHost(raw.r);
    return {
      type: 'pv',
      pathKey,
      locale,
      newSession: raw.s === 1 || raw.s === true,
      source: utmSource ?? (host ? toKey(host) : 'direct'),
      medium: shortText(raw.um),
      campaign: shortText(raw.uc, 60),
    };
  }
  if (raw.t === 'cta') {
    if (typeof raw.x !== 'string' || !(WEB_CTA_TARGETS as readonly string[]).includes(raw.x)) return null;
    return { type: 'cta', pathKey, locale, target: raw.x as WebCtaTarget };
  }
  if (raw.t === 'scroll') {
    const depth = Number(raw.d);
    if (!(WEB_SCROLL_DEPTHS as readonly number[]).includes(depth)) return null;
    return { type: 'scroll', pathKey, locale, depth };
  }
  return null;
}

/** One day's rollup document in `web_daily_stats/{YYYY-MM-DD}` (Israel time). */
export interface WebDailyStats {
  date: string;
  pageviews?: number;
  sessions?: number;
  ctaTotal?: number;
  byPath?: Record<string, number>;
  byHour?: Record<string, number>;
  bySource?: Record<string, number>;
  byMedium?: Record<string, number>;
  byCampaign?: Record<string, number>;
  byLanding?: Record<string, number>;
  byDevice?: Record<string, number>;
  byCountry?: Record<string, number>;
  byLocale?: Record<string, number>;
  ctaByTarget?: Record<string, number>;
  ctaByPath?: Record<string, number>;
  scrollByDepth?: Record<string, number>;
}
