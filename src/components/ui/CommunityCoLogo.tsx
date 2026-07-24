'use client';

/**
 * CommunityCoLogo — closed-community co-branding mark.
 *
 * Renders the current user's community logo (Wix / school / unit) to the LEFT
 * of the OUT logotype, separated by a thin divider — "community × OUT". This is
 * the co-brand lockup for closed communities (see
 * .claude/knowledge/communities-architecture.md → BUILD: co-logo).
 *
 * Data source: the user's community authority doc (`authorities/{id}`, read is
 * public), resolved from `core.tenantId` (companies/schools/units, stamped by
 * the validateAccessCode CF) with `core.authorityId` as a fallback
 * (municipalities). `authorities.logoUrl` is the co-brand image.
 *
 * GATE: the mark renders ONLY when the authority has BOTH `logoUrl` AND
 * `coBrandingEnabled === true` (explicit per-community opt-in, decoupled from
 * the billing/league `isActiveClient` — axiom §6). Default (flag absent) =
 * not shown, even if a logoUrl exists, so enabling the feature co-brands
 * nobody until a community is deliberately switched on.
 *
 * Fallback: no community / not opted-in / no logoUrl → renders NOTHING, so the
 * header shows only the OUT mark with no layout shift. Never a broken image.
 */

import React, { useEffect, useState } from 'react';
import { useUserStore } from '@/features/user';
import { getAuthority } from '@/features/admin/services/authority.service';

// Module-level cache keyed by community id so the header doesn't re-hit
// Firestore on every mount/route change. Value `null` = "resolved, no logo".
const logoCache = new Map<string, string | null>();

export default function CommunityCoLogo() {
  const profile = useUserStore((s) => s.profile);
  const communityId = profile?.core?.tenantId ?? profile?.core?.authorityId ?? null;

  const [logoUrl, setLogoUrl] = useState<string | null>(() =>
    communityId ? logoCache.get(communityId) ?? null : null,
  );

  useEffect(() => {
    let cancelled = false;

    if (!communityId) {
      setLogoUrl(null);
      return;
    }
    if (logoCache.has(communityId)) {
      setLogoUrl(logoCache.get(communityId) ?? null);
      return;
    }

    getAuthority(communityId)
      .then((auth) => {
        // Gate: render only when the community explicitly opted into co-branding.
        const url = auth?.coBrandingEnabled && auth?.logoUrl ? auth.logoUrl : null;
        logoCache.set(communityId, url);
        if (!cancelled) setLogoUrl(url);
      })
      .catch(() => {
        // Read failure → behave exactly like "no community": OUT only.
        if (!cancelled) setLogoUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [communityId]);

  if (!logoUrl) return null;

  return (
    <div dir="ltr" className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt="קהילה"
        className="h-6 max-w-[72px] object-contain select-none"
      />
      <div className="w-px h-5 bg-gray-300" aria-hidden />
    </div>
  );
}
