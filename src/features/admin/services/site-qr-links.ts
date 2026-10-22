/**
 * Site QR links — the three FIXED-id marketing links the marketing site's
 * app-store QR codes point at (`{SHORT_LINK_DOMAIN}/r/{id}?src=site-qr`).
 *
 * The ids are part of the printed/rendered QR, so they never change; the
 * DESTINATIONS live on the `marketing_links/{id}` doc and are edited in
 * /admin/links like any other smart link — change the store URL there and
 * every QR already out in the world follows. Each scan is counted by the
 * shared `/r/[id]` handler (clicksCount + daily_stats + per-click record,
 * which also stores `source` from the `src` query param).
 *
 * Pure data + one pure builder (no Firestore) so it's unit-testable; the
 * create call lives in `createMarketingLinkWithId`.
 */

import {
  SHORT_LINK_DOMAIN,
  type CreateMarketingLinkInput,
} from './marketing-links.service';

/**
 * The OutRun store listings the site QR links START with (owner, 22.10).
 * Only the seed for a newly created link — after that the doc's own fields
 * are the truth and the owner edits them in /admin/links. Deliberately NOT
 * the hub-wide `DEFAULT_LINK_DESTINATIONS` (other existing smart links keep
 * theirs until the owner changes them).
 */
export const SITE_QR_SEED_URLS = {
  ios: 'https://apps.apple.com/il/app/outrun/id6770799913?l=he',
  android: 'https://play.google.com/store/apps/details?id=co.il.appout.outrun',
  /** Desktop / other devices on the smart link → the site's download page. */
  desktop: `${SHORT_LINK_DOMAIN}/web/he/download`,
} as const;

export type SiteQrLinkId = 'app-ios' | 'app-android' | 'app-smart';

export interface SiteQrLinkDef {
  id: SiteQrLinkId;
  /** Short Hebrew label for the admin card. */
  label: string;
  /** What the link does, one line, for the admin card. */
  hint: string;
}

export const SITE_QR_LINKS: readonly SiteQrLinkDef[] = [
  { id: 'app-smart', label: 'חכם (לפי מכשיר)', hint: 'הקוד הראשי באתר: אייפון → App Store · אנדרואיד → Google Play · אחר → דף ההורדה באתר' },
  { id: 'app-ios', label: 'App Store', hint: 'כל סריקה → App Store' },
  { id: 'app-android', label: 'Google Play', hint: 'כל סריקה → Google Play' },
] as const;

/**
 * The create payload for one site QR link, seeded with `SITE_QR_SEED_URLS`.
 * The per-store links fill EVERY slot with their own store so a scan never
 * lands anywhere else; the smart link (the site's primary QR) routes iOS →
 * App Store, Android → Google Play, anything else → the site's download page.
 */
export function buildSiteQrLinkInput(id: SiteQrLinkId, createdBy?: string): CreateMarketingLinkInput {
  const { ios, android, desktop } = SITE_QR_SEED_URLS;
  const store = id === 'app-ios' ? ios : id === 'app-android' ? android : null;
  const def = SITE_QR_LINKS.find((d) => d.id === id)!;
  return {
    friendlyName: `אתר · QR · ${def.label}`,
    utmSource: 'website',
    utmMedium: 'qr',
    utmCampaign: `site_qr_${id.replace('app-', '')}`,
    linkType: 'web',
    useSmartLink: true,
    iosUrl: store ?? ios,
    androidUrl: store ?? android,
    desktopUrl: store ?? desktop,
    fallbackUrl: store ?? desktop,
    isActive: true,
    notes: `קוד QR באתר (outrun.co.il/web) מפנה ל-/r/${id}. אל תמחקו ואל תשנו את המזהה — רק את היעד.`,
    createdBy,
  };
}
