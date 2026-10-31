'use client';

/**
 * The scan's dead ends (ScanEdges board), each with a way on: too dark, nothing recognized, or
 * the request failed (limit / network). People in the photo are not a dead end (owner 31.10).
 */
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import type { ScanApiError } from './scan-api';
import type { ScanEdge } from './scan-flow';
import { SCAN_PRIMARY_BUTTON, SCAN_SECONDARY_BUTTON } from './ScanConfirmPanel';

export interface ScanEdgePanelProps {
  edge?: ScanEdge;
  error?: ScanApiError;
  onRetake: () => void;
  onPick: () => void;
}

export default function ScanEdgePanel({ edge, error, onRetake, onPick }: ScanEdgePanelProps) {
  const t = useT(map);
  const copy = edge === 'dark'
    ? { title: t('scan.edge.dark.title'), body: t('scan.edge.dark.body'), retake: t('scan.action.retake') }
    : edge === 'not_found'
        ? { title: t('scan.edge.notFound.title'), body: t('scan.edge.notFound.body'), retake: t('scan.action.closer') }
        : error === 'rate_limited'
          ? { title: t('scan.error.limit.title'), body: t('scan.error.limit.body'), retake: null }
          : { title: t('scan.error.generic.title'), body: t('scan.error.generic.body'), retake: t('scan.action.retry') };
  return (
    <div className="flex flex-col gap-2 text-center">
      <h2 className="text-[19px] font-black text-v2-ink">{copy.title}</h2>
      <p className="mb-2 text-[13.5px] font-bold leading-relaxed text-v2-muted">{copy.body}</p>
      {copy.retake && (
        <button type="button" onClick={onRetake} className={`${SCAN_PRIMARY_BUTTON} text-[15.5px]`}>{copy.retake}</button>
      )}
      <button type="button" onClick={onPick} className={`${SCAN_SECONDARY_BUTTON} text-[14.5px]`}>{t('scan.action.pick')}</button>
    </div>
  );
}
