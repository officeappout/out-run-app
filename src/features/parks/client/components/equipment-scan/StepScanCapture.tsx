'use client';

/**
 * Park mapping, step "צילום" (ScanMap board): guided shots, 3 fixed angles then "closer" shots at
 * whatever is still unsure, 5 at most. The camera itself is the OS camera (one photo per tap), so
 * this step shows the guide, the last photo (with the unsure item's box when asking for a closer
 * shot), the progress and the photos taken. "המשך" once the guide is done or 3 usable photos exist.
 */
import { Camera, Loader2 } from 'lucide-react';
import { PARK_MAX_SHOTS, PARK_MIN_SHOTS } from '@/lib/ai/scan/scan-merge';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { V2BackButton, V2PrimaryButton } from '../contribution-wizard/wizard-v2';
import type { useParkScan } from './useParkScan';

export interface StepScanCaptureProps {
  scan: ReturnType<typeof useParkScan>;
  onNext: () => void;
  onBack: () => void;
}

export default function StepScanCapture({ scan, onNext, onBack }: StepScanCaptureProps) {
  const t = useT(map);
  const { shots, guide, busy, notice, shoot } = scan;
  const usable = shots.filter((s) => s.base64);
  const enough = usable.length >= PARK_MIN_SHOTS;
  const ref = guide.kind === 'closer' ? shots[guide.shot] : usable[usable.length - 1];
  const box = guide.kind === 'closer' ? guide.box : undefined;
  const title = guide.kind === 'angle'
    ? t(`wizard.scan.angle.${guide.angle}.title` as 'wizard.scan.angle.wide.title')
    : guide.kind === 'closer' ? t('wizard.scan.closer.title') : t('wizard.scan.done.title');
  const hint = guide.kind === 'angle'
    ? t(`wizard.scan.angle.${guide.angle}.hint` as 'wizard.scan.angle.wide.hint')
    : guide.kind === 'closer' ? t('wizard.scan.closer.hint') : t('wizard.scan.done.hint');
  const noticeText = notice === 'people' ? t('wizard.scan.notice.people')
    : notice === 'dark' ? t('wizard.scan.notice.dark')
      : notice === 'rate_limited' ? t('wizard.scan.notice.limit')
        : notice ? t('wizard.scan.notice.error') : null;

  return (
    <div className="flex h-full flex-col px-4 pb-6">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div className="relative min-h-[200px] flex-1 overflow-hidden rounded-[20px] bg-v2-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {ref?.previewUrl && <img src={ref.previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
          {box && (
            <span
              aria-hidden
              className="absolute rounded-[14px] shadow-[0_0_0_3px_#00baf7,0_0_0_2000px_rgba(14,20,25,0.45)]"
              style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
            />
          )}
          <span className="absolute start-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-extrabold text-white">
            {t('wizard.scan.progress', { n: String(Math.min(shots.length + 1, PARK_MAX_SHOTS)), max: String(PARK_MAX_SHOTS) })}
          </span>
          <div className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-v2-accent transition-all" style={{ width: `${(shots.length / PARK_MAX_SHOTS) * 100}%` }} />
          </div>
        </div>
        <div aria-live="polite">
          <h3 className="text-[19px] font-black text-v2-ink">{title}</h3>
          <p className="text-[13.5px] font-bold text-v2-muted">{hint}</p>
          {noticeText && <p className="mt-2 rounded-[14px] bg-amber-50 px-3 py-2 text-[12.5px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200">{noticeText}</p>}
        </div>
        {usable.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {usable.map((s, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={s.previewUrl ?? ''} alt="" className="h-14 w-14 flex-shrink-0 rounded-[12px] object-cover shadow-v2-ring" />
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-shrink-0 items-center gap-3">
        <V2BackButton onClick={onBack} />
        {guide.kind === 'done' ? (
          <V2PrimaryButton onClick={onNext}>{t('wizard.continue')}</V2PrimaryButton>
        ) : (
          <V2PrimaryButton onClick={() => void shoot()} disabled={busy} arrow={false}>
            <span className="inline-flex items-center gap-2">
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Camera size={18} strokeWidth={2.4} aria-hidden />}
              {busy ? t('wizard.scan.analyzing') : t('wizard.scan.shoot')}
            </span>
          </V2PrimaryButton>
        )}
      </div>
      {(enough || notice === 'rate_limited') && guide.kind !== 'done' && !busy && (
        <button type="button" onClick={onNext} className="mt-2 text-center text-[13px] font-extrabold text-v2-deep">
          {t('wizard.scan.skip')}
        </button>
      )}
    </div>
  );
}
