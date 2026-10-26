/**
 * Static illustration of a running route for the 'route-player' tour preview: the drawn map
 * and the live card with its pause / stop controls.
 */
import { Pause, Square } from 'lucide-react';
import PreviewMap from './PreviewMap';
import { useT } from '@/hooks/useT';
import { legal } from '@/messages/ns/legal';
import { common } from '@/messages/ns/common';
import { unitLabel } from '@/lib/i18n/units';

const STATS = [
  { v: '12:40', id: 'time' },
  { v: '1.8', id: 'km' },
  { v: '7:02', id: 'pace' },
] as const;

export default function PreviewRoutePlayer() {
  const t = useT(legal);
  const tCommon = useT(common);
  const label = (id: (typeof STATS)[number]['id']) =>
    id === 'km' ? unitLabel('km', tCommon) : id === 'time' ? t('help.preview.routePlayer.time') : t('help.preview.routePlayer.pace');
  return (
    <div className="absolute inset-0 overflow-hidden">
      <PreviewMap route />
      <div className="absolute inset-x-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        <div className="rounded-v2-card bg-white p-4 shadow-v2-float">
          <div className="flex justify-around">
            {STATS.map((s) => (
              <div key={s.id} className="text-center">
                <p className="text-[22px] font-black tabular-nums text-v2-ink">{s.v}</p>
                <p className="text-[12px] font-bold text-v2-muted">{label(s.id)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-7" data-coach="route-player-controls">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-v2-tint text-v2-deep"><Pause size={24} aria-hidden /></span>
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#e5484d] text-white"><Square size={20} fill="white" aria-hidden /></span>
          </div>
        </div>
      </div>
    </div>
  );
}
