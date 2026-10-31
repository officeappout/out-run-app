'use client';

/**
 * "מופה על ידי {name}" on the park page (camera scan boards, enable_equipment_scan_v1): the user
 * whose contribution mapped the park, by their public name (userPublic, the same source as the
 * reviews). Nothing when the park has no mapper or the flag is off.
 */
import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { getReviewerNames } from '@/features/parks/core/services/contribution.service';
import { useEquipmentScanV1 } from '@/hooks/useEquipmentScanV1';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

export default function ParkMappedBy({ userId }: { userId?: string | null }) {
  const t = useT(map);
  const on = useEquipmentScanV1();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(null);
    if (!on || !userId) return;
    let alive = true;
    getReviewerNames([userId]).then((m) => { if (alive) setName(m[userId] ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, [on, userId]);
  if (!on || !name) return null;
  return (
    <p className="mb-4 flex items-center gap-1.5 text-[12.5px] font-bold text-v2-muted">
      <UserRound size={14} strokeWidth={2.4} aria-hidden />
      {t('parkDetail.mappedBy', { name })}
    </p>
  );
}
