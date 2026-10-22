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
  DEFAULT_LINK_DESTINATIONS,
  type CreateMarketingLinkInput,
} from './marketing-links.service';

export type SiteQrLinkId = 'app-ios' | 'app-android' | 'app-smart';

export interface SiteQrLinkDef {
  id: SiteQrLinkId;
  /** Short Hebrew label for the admin card. */
  label: string;
  /** What the link does, one line, for the admin card. */
  hint: string;
}

export const SITE_QR_LINKS: readonly SiteQrLinkDef[] = [
  { id: 'app-ios', label: 'App Store', hint: 'כל סריקה → App Store' },
  { id: 'app-android', label: 'Google Play', hint: 'כל סריקה → Google Play' },
  { id: 'app-smart', label: 'חכם (לפי מכשיר)', hint: 'אייפון → App Store · אנדרואיד → Google Play · מחשב → האתר' },
] as const;

/**
 * The create payload for one site QR link, seeded with today's store URLs
 * (`DEFAULT_LINK_DESTINATIONS`). The per-store links fill EVERY slot with
 * their own store so a scan never lands anywhere else; the smart link
 * leaves the slots empty so it follows the global defaults per device.
 */
export function buildSiteQrLinkInput(id: SiteQrLinkId, createdBy?: string): CreateMarketingLinkInput {
  const ios = DEFAULT_LINK_DESTINATIONS.iosUrl;
  const android = DEFAULT_LINK_DESTINATIONS.androidUrl;
  const store = id === 'app-ios' ? ios : id === 'app-android' ? android : null;
  const def = SITE_QR_LINKS.find((d) => d.id === id)!;
  return {
    friendlyName: `אתר · QR · ${def.label}`,
    utmSource: 'website',
    utmMedium: 'qr',
    utmCampaign: `site_qr_${id.replace('app-', '')}`,
    linkType: 'web',
    useSmartLink: true,
    iosUrl: store,
    androidUrl: store,
    desktopUrl: store,
    fallbackUrl: store,
    isActive: true,
    notes: `קוד QR באתר (outrun.co.il/web) מפנה ל-/r/${id}. אל תמחקו ואל תשנו את המזהה — רק את היעד.`,
    createdBy,
  };
}
