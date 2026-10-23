'use client';

import { useTogetherLayerV1 } from '@/features/workout-engine/together/hooks/useTogetherLayerV1';
import { useTogetherSummary } from '@/features/workout-engine/together/hooks/useTogetherSummary';
import TogetherSummarySection from '@/features/workout-engine/together/components/TogetherSummarySection';

/** Flag + data gate for the together layer of the existing aerobic summary. */
export default function TogetherSummaryLayer(props: { groupId?: string | null; attendanceId?: string | null; currentUid?: string; readOnly?: boolean }) {
  const on = useTogetherLayerV1();
  const summary = useTogetherSummary(props.groupId, props.attendanceId, props.currentUid, on && !props.readOnly);
  return summary ? <TogetherSummarySection summary={summary} /> : null;
}
