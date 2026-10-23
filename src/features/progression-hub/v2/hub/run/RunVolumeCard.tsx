'use client';

/**
 * Weekly volume (PG-3): a measurable chart — axis, values, done vs planned —
 * with a km / minutes switch. Plan weeks when there is a plan (planned volume
 * from run-plan.loader), else the last 8 calendar weeks (done only).
 */
import { useMemo, useState } from 'react';
import { Card, SegmentedPicker } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import VolumeChart, { type VolumeDatum } from '../components/VolumeChart';
import type { HubTone } from '../hub-colors';
import type { VolumeUnit } from './run-page.model';

export default function RunVolumeCard({
  build,
  tone,
  byPlanWeek,
}: {
  build: (unit: VolumeUnit) => VolumeDatum[];
  tone: HubTone;
  byPlanWeek: boolean;
}) {
  const t = useT(profileNs);
  const [unit, setUnit] = useState<VolumeUnit>('km');
  const data = useMemo(() => build(unit), [build, unit]);
  const options = useMemo(
    () => [
      { key: 'km' as const, label: t('hubV2.run.volume.km') },
      { key: 'min' as const, label: t('hubV2.run.volume.min') },
    ],
    [t],
  );
  const fmt = (v: number) => formatNumber(v, t.locale, { maximumFractionDigits: unit === 'km' ? 1 : 0 });
  const current = data.find((d) => d.current);
  const hasPlanned = data.some((d) => d.planned != null && d.planned > 0);
  if (!data.some((d) => d.done > 0 || (d.planned ?? 0) > 0)) return null;
  return (
    <Card padding="none" className="px-4 py-3.5" data-run-volume={unit}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.run.volume.title')}</h3>
        <SegmentedPicker className="w-[132px]" options={options} value={unit} onChange={setUnit} ariaLabel={t('hubV2.run.volume.unitLabel')} />
      </div>
      <VolumeChart
        data={data}
        color={tone.fill}
        format={fmt}
        ariaLabel={t('hubV2.run.volume.title')}
        describe={(d) =>
          t('hubV2.run.volume.rowAria', {
            label: d.label,
            done: fmt(d.done),
            planned: d.planned != null ? fmt(d.planned) : '',
            hasPlan: d.planned != null ? 'yes' : 'no',
            unit,
          })
        }
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] font-bold text-v2-muted">
        <span>{t('hubV2.run.volume.axis', { axis: byPlanWeek ? 'plan' : 'calendar', unit })}</span>
        {hasPlanned && (
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: tone.fill }} aria-hidden />
              {t('hubV2.run.volume.done')}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ boxShadow: `inset 0 0 0 1.5px ${tone.fill}66`, background: `${tone.fill}14` }} aria-hidden />
              {t('hubV2.run.volume.planned')}
            </span>
          </span>
        )}
      </div>
      {current && current.planned != null && current.planned > 0 && (
        <p className="mt-2 text-[12.5px] font-extrabold" style={{ color: tone.text }}>
          {t('hubV2.run.volume.thisWeek', { done: fmt(current.done), planned: fmt(current.planned), unit })}
        </p>
      )}
    </Card>
  );
}
