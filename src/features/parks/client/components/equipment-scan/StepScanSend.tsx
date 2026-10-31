'use client';

/**
 * Park mapping, step "שליחה" (ScanMap board): the summary card (name, photos without people,
 * equipment), "יחד ממפים כל עיר" with the "מופה על ידי" promise, and "שלח לאישור" into the
 * existing approval queue.
 */
import { Images, MapPin, Users } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { V2BackButton, V2PrimaryButton } from '../contribution-wizard/wizard-v2';

export interface StepScanSendProps {
  parkName: string;
  photos: number;
  equipmentNames: readonly string[];
  unknownCount: number;
  mapperName: string;
  submitting: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export default function StepScanSend({ parkName, photos, equipmentNames, unknownCount, mapperName, submitting, onBack, onSubmit }: StepScanSendProps) {
  const t = useT(map);
  return (
    <div className="flex h-full flex-col px-4 pb-6">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <p className="text-[13px] font-extrabold text-v2-deep">{t('wizard.scan.send.title')}</p>
        <div className="flex flex-col gap-2 rounded-[20px] bg-white p-4 shadow-v2-card">
          <p className="flex items-center gap-2 text-[17px] font-black text-v2-ink"><MapPin size={18} strokeWidth={2.4} className="text-v2-deep" aria-hidden />{parkName}</p>
          <p className="flex items-center gap-2 text-[13px] font-bold text-v2-ink-2"><Images size={16} strokeWidth={2.4} className="text-v2-muted" aria-hidden />{t('wizard.scan.send.photos', { count: photos })}</p>
          {equipmentNames.length > 0 && (
            <p className="text-[13px] font-bold leading-relaxed text-v2-ink-2">{t('wizard.scan.send.equipment', { list: equipmentNames.join(', ') })}</p>
          )}
          {unknownCount > 0 && <p className="text-[12.5px] font-bold text-v2-muted">{t('wizard.scan.send.unknown', { count: unknownCount })}</p>}
        </div>
        <div className="flex gap-3 rounded-[20px] bg-v2-tint p-4">
          <Users size={20} strokeWidth={2.4} className="mt-0.5 flex-shrink-0 text-v2-deep" aria-hidden />
          <div>
            <p className="text-[15px] font-black text-v2-ink">{t('wizard.scan.community.title')}</p>
            <p className="text-[13px] font-bold leading-relaxed text-v2-ink-2">{mapperName ? t('wizard.scan.community.body', { name: mapperName }) : t('wizard.scan.community.bodyNoName')}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-shrink-0 items-center gap-3">
        <V2BackButton onClick={onBack} />
        <V2PrimaryButton onClick={onSubmit} disabled={submitting} loading={submitting} arrow={false}>{t('wizard.scan.send.submit')}</V2PrimaryButton>
      </div>
    </div>
  );
}
