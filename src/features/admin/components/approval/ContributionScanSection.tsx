'use client';

/**
 * Approval center, a contribution's mapping details (camera scan boards, ScanMap "מרכז האישורים"):
 * who mapped it (their public name, not the raw uid), "צולם · N" when it came from photos, how
 * many detected items were unsure, and the objects the catalog doesn't have, with their photo:
 * "מתקן חדש להוסיף לקטלוג" (owner 31.10). Admin panel copy is Hebrew in place, as in this folder.
 */
import { useEffect, useState } from 'react';
import { Camera, PackagePlus, UserRound } from 'lucide-react';
import { getReviewerNames } from '@/features/parks/core/services/contribution.service';
import type { UserContribution } from '@/types/contribution.types';
import { CONFIRM_AT } from '@/lib/ai/scan/scan-result';
import { useEquipmentScanV1 } from '@/hooks/useEquipmentScanV1';

export interface ContributionScanSectionProps {
  contribution: Pick<UserContribution, 'userId' | 'scan' | 'gymEquipment'> | null | undefined;
}

export function scanSummary(scan: UserContribution['scan'], equipmentCount: number) {
  const unsure = (scan?.items ?? []).filter((i) => i.confidence < CONFIRM_AT).length;
  return { photos: scan?.photos ?? 0, equipmentCount, unsure, unknown: scan?.unknown ?? [] };
}

export default function ContributionScanSection({ contribution }: ContributionScanSectionProps) {
  const on = useEquipmentScanV1();
  const uid = on ? contribution?.userId : undefined;
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(null);
    if (!uid) return;
    let alive = true;
    getReviewerNames([uid]).then((m) => { if (alive) setName(m[uid] ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  if (!on || !contribution) return null;
  const s = scanSummary(contribution.scan, contribution.gymEquipment?.length ?? 0);
  return (
    <div className="space-y-3 px-5 pb-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {name && (
          <span className="inline-flex items-center gap-1.5 font-bold text-gray-900">
            <UserRound size={14} className="text-gray-400" />
            מופה על ידי: {name}
          </span>
        )}
        {contribution.scan && (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-bold text-cyan-700">
            <Camera size={12} /> צולם · {s.photos}
          </span>
        )}
      </div>
      {contribution.scan && (
        <p className="text-xs font-bold text-gray-500">
          מתקנים: {s.equipmentCount}{s.unsure > 0 ? ` · ${s.unsure === 1 ? 'אחד "לא בטוח"' : `${s.unsure} "לא בטוח"`}` : ''}
        </p>
      )}
      {s.unknown.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-700">
            <PackagePlus size={14} /> מתקן חדש להוסיף לקטלוג ({s.unknown.length})
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {s.unknown.map((u, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-amber-100 bg-amber-50/40">
                {u.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.photoUrl} alt="" className="h-24 w-full object-cover" loading="lazy" />
                )}
                <p className="p-2 text-xs font-bold text-gray-700" dir="ltr">{u.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
