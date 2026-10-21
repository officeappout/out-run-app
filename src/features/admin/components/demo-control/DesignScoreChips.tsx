'use client';
/** One score chip per design dimension (בהירות / עקביות v2 / צפיפות / RTL), toned by the value. */
import { StatusPill } from '@/features/admin/components/ui';
import { QA_DESIGN_DIMENSIONS, type QaDesignDimension } from '@/lib/demo-control/qa-summary';
import { DESIGN_DIMENSION_HE, fmtScore, scoreTone } from '@/lib/demo-control/qa-design';

export default function DesignScoreChips({ scores }: { scores: Record<QaDesignDimension, number | null> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {QA_DESIGN_DIMENSIONS.map((d) => (
        <StatusPill key={d} tone={scoreTone(scores[d])}>
          <span className="whitespace-nowrap">
            {DESIGN_DIMENSION_HE[d]} <b dir="ltr">{fmtScore(scores[d])}</b>
          </span>
        </StatusPill>
      ))}
    </div>
  );
}
