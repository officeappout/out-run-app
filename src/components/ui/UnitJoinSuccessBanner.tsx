'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import UnitIconBadge from './UnitIconBadge';
import type { AccessCodeResult } from '@/features/user/onboarding/services/access-code.service';

interface UnitJoinSuccessBannerProps {
  result: AccessCodeResult;
}

/**
 * Shared display for "you just joined X via an access code" — the ONE
 * place this renders, used by every access-code entry point
 * (AccessCodeStep.tsx, PersonaStep.tsx's inline code modal,
 * SettingsModal.tsx's coupon section, arena/create/page.tsx's group-join
 * flow). David, 07.09.2026: the underlying JOIN mechanisms genuinely differ
 * (persona/core.tenantId writes vs. community_groups membership) and stay
 * separate — this only unifies what the user SEES afterward, which is the
 * part that can be shared regardless of which mechanism triggered it.
 *
 * Unit name is the mandatory part (from result.unitPath, no fetch needed —
 * renders instantly). The icon is a bonus that resolves a beat later from
 * unitDirectory; callers wrap this with their own surrounding copy
 * ("ברוך הבא ל-", "הקוד אומת, הצטרפת ל-") since that phrasing legitimately
 * differs per screen — only the name+icon chip itself is shared.
 */
export default function UnitJoinSuccessBanner({ result }: UnitJoinSuccessBannerProps) {
  const unitName = result.unitPath[result.unitPath.length - 1] || result.unitId;
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    setIconUrl(null);
    if (result.tenantType !== 'military') return; // icons are a military-only feature today
    let cancelled = false;
    const directoryId = result.unitId && result.unitId !== result.tenantId
      ? `${result.tenantId}__${result.unitId}`
      : result.tenantId;
    getDoc(doc(db, 'unitDirectory', directoryId))
      .then((snap) => {
        if (cancelled) return;
        setIconUrl(snap.exists() ? ((snap.data().iconUrl as string | null) ?? null) : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [result.tenantId, result.unitId, result.tenantType]);

  return (
    <div className="flex items-center gap-3" dir="rtl">
      {result.tenantType === 'military' && (
        <UnitIconBadge unitId={result.unitId || result.tenantId} iconUrl={iconUrl} name={unitName} size={40} />
      )}
      <p className="text-base font-bold text-gray-900">{unitName}</p>
    </div>
  );
}
