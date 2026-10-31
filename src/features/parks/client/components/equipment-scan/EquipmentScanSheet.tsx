'use client';

/**
 * Camera scan, phase 1 (enable_equipment_scan_v1, ScanEquip + ScanEdges boards). Opening it starts
 * the camera; the photo stays behind a dark layer with the brand scan line while we recognize it,
 * and a white panel at the bottom carries the result: "זה נכון?", an edge state, or the list.
 * A confirmed / picked item hands its gym_equipment id to `onRecognized` (the host opens the
 * existing equipment drawer). Cancelling the camera closes the screen.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useToast } from '@/components/ui/Toast';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { useEquipmentScan } from './useEquipmentScan';
import { useParkCatalog } from './useParkCatalog';
import ScanConfirmPanel from './ScanConfirmPanel';
import ScanEdgePanel from './ScanEdgePanel';
import ScanPickPanel from './ScanPickPanel';

export interface EquipmentScanSheetProps {
  open: boolean;
  onClose: () => void;
  /** The park the user is standing in, when known: its items are preferred. */
  parkId?: string;
  onRecognized: (equipmentId: string) => void;
}

export default function EquipmentScanSheet({ open, onClose, parkId, onRecognized }: EquipmentScanSheetProps) {
  const t = useT(map);
  const locale = (t as { locale?: string }).locale ?? 'he';
  const reduceMotion = useReducedMotion();
  const { showToast } = useToast();
  const onDenied = useCallback(() => showToast('error', t('scan.permission')), [showToast, t]);
  const { state, setState, preview, shoot, reset } = useEquipmentScan(parkId, onDenied);
  const { catalog, loading } = useParkCatalog(locale);
  const byId = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const retake = useCallback(async () => {
    if (!(await shoot())) close();
  }, [shoot, close]);

  useEffect(() => {
    if (open && state.kind === 'idle') void retake();
    // Only on open: a retake inside the screen calls shoot itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = useCallback((id: string) => {
    reset();
    onRecognized(id);
  }, [reset, onRecognized]);

  if (!open || typeof document === 'undefined' || state.kind === 'idle') return null;

  const analyzing = state.kind === 'analyzing';
  const tall = state.kind === 'confirm' || state.kind === 'pick';

  return createPortal(
    <div className="fixed inset-0 bg-v2-ink" style={{ zIndex: SHEET_Z.nestedModal }} role="dialog" aria-modal="true" aria-label={t('scan.title')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {preview && <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-[rgba(14,20,25,0.55)]" />
      {analyzing && (
        <div aria-hidden className="absolute inset-x-10 top-[22%] h-[40%] overflow-hidden rounded-[20px] shadow-[inset_0_0_0_2px_rgba(0,186,247,0.6)]">
          <motion.span
            className="absolute inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-v2-accent to-transparent shadow-[0_0_18px_#00baf7]"
            initial={{ top: '8%' }}
            animate={reduceMotion ? { top: '46%' } : { top: ['8%', '90%'] }}
            transition={reduceMotion ? { duration: 0 } : { duration: 1.6, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
          />
        </div>
      )}
      <IconButton aria-label={t('scan.close')} tone="white-ring" size={36} className="absolute end-3 top-[max(12px,env(safe-area-inset-top))] z-10" onClick={close}>
        <X className="h-4 w-4" />
      </IconButton>
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-[28px] bg-v2-surface px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 shadow-v2-sheet ${tall ? 'top-[120px]' : ''}`}
        aria-live="polite"
      >
        <span aria-hidden className="mx-auto mb-3 h-1.5 w-10 flex-shrink-0 rounded-full bg-[#dfe7ed]" />
        <div className={`min-h-0 flex-1 ${state.kind === 'confirm' ? 'overflow-y-auto' : 'flex flex-col'}`}>
          {analyzing && (
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <span aria-hidden className="h-11 w-11 animate-spin rounded-full border-4 border-v2-tint border-t-v2-accent" />
              <h2 className="text-[19px] font-black text-v2-ink">{t('scan.analyzing.title')}</h2>
              <p className="text-[13px] font-bold text-v2-muted">{t('scan.analyzing.body')}</p>
            </div>
          )}
          {state.kind === 'confirm' && (
            <ScanConfirmPanel
              photoUrl={preview}
              equipment={byId.get(state.equipmentId) ?? null}
              alternatives={state.alternatives.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e)}
              open={state.open}
              onYes={() => pick(state.equipmentId)}
              onNo={() => setState({ ...state, open: !state.open })}
              onPick={pick}
              onSearch={() => setState({ kind: 'pick' })}
            />
          )}
          {(state.kind === 'edge' || state.kind === 'error') && (
            <ScanEdgePanel
              edge={state.kind === 'edge' ? state.edge : undefined}
              error={state.kind === 'error' ? state.error : undefined}
              onRetake={retake}
              onPick={() => setState({ kind: 'pick' })}
              onCancel={close}
            />
          )}
          {state.kind === 'pick' && <ScanPickPanel catalog={catalog} loading={loading} onPick={pick} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
