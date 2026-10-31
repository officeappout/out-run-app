'use client';
/**
 * Park welcome pieces shared by both station intros (enable_park_live_v2, board PlayerParkWelcome):
 * when the session starts AT the park, the intro greets "welcome to <park>, you're already here, so
 * strength first", and every intro ends with what comes after the station ("then: a 25 min walk").
 */
import React from 'react';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { StationContext } from '../../station-flow';

export function ParkWelcomeHeading({ context }: { context: StationContext }) {
  const t = useT(player);
  if (!context.atStart) return null;
  return (
    <div className="flex flex-col">
      <span className="text-[22px] font-black leading-[27px] text-v2-ink" style={{ fontFamily: 'var(--font-simpler)' }}>
        {context.parkName ? t('parkLive.welcome.title', { park: context.parkName }) : t('parkLive.welcome.titleNoName')}
      </span>
      <span className="text-[13.5px] font-bold text-v2-ink-2">{t('parkLive.welcome.sub')}</span>
    </div>
  );
}

export function ParkAfterRow({ context }: { context: StationContext }) {
  const t = useT(player);
  if (context.afterSec == null) return null;
  const min = String(Math.max(1, Math.round(context.afterSec / 60)));
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-white p-3 ring-1 ring-inset ring-v2-hairline">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep">
        <ActivityGlyph kind="aerobic" subtype={context.nextLegKind} className="h-4 w-4" />
      </span>
      <span className="text-[14px] font-black text-v2-ink">
        {t(context.nextLegKind === 'running' ? 'parkLive.after.running' : 'parkLive.after.walking', { min })}
      </span>
    </div>
  );
}
