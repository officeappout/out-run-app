'use client';

/**
 * WeekInfoButton — the "i" next to "לו״ז אימונים" (enable_feature_info_sheets_v1, shown only
 * where the week builder is the real way to move a session: enable_week_builder_v1).
 */

import React, { useMemo } from 'react';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import { getProgramIcon } from '@/features/content/programs/core/program-icon.util';
import InfoSheetButton from '../InfoSheetButton';
import { buildWeekInfo, type WeekInfoDayInput } from './week-info.model';
import WeekInfoDemo from './WeekInfoDemo';

export interface WeekInfoButtonProps {
  days: readonly WeekInfoDayInput[];
  /** The home strip's "שינוי לוז" label (home namespace). */
  editLabel: string;
  /** The strip's resolved program icon key (resolveIconKey). */
  programIconKey: string;
}

export default function WeekInfoButton({ days, editLabel, programIconKey }: WeekInfoButtonProps) {
  const t = useT(schedule);
  const model = useMemo(() => buildWeekInfo(days), [days]);
  if (!model) return null;
  const labels = {
    edit: editLabel,
    arrange: t('planner.arrange'),
    confirm: t('weekBuilder.confirm'),
    onlyWeek: t('planner.scope.onlyWeek'),
    forward: t('planner.scope.forward'),
  };
  // Same tile as the builder's strength session (SessionIcon).
  const icon = (
    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-v2-tint text-v2-deep">
      {getProgramIcon(programIconKey, 'w-5 h-5')}
    </span>
  );
  return (
    <InfoSheetButton
      title={t('featureInfo.week.title')}
      openLabel={t('featureInfo.week.open')}
      lead={t('featureInfo.week.lead', labels)}
      demoLabel={t('featureInfo.week.fromWeek')}
      demo={<WeekInfoDemo model={model} t={t} editLabel={editLabel} icon={icon} />}
      steps={[t('featureInfo.week.step1', labels), t('featureInfo.week.step2'), t('featureInfo.week.step3', labels)]}
      chips={[t('featureInfo.week.chip1'), t('featureInfo.week.chip2')]}
      kellyContext={(q) => t('featureInfo.week.kellyContext', { topic: t('featureInfo.week.topic'), q })}
    />
  );
}
