/**
 * Static illustration of the guided station welcome screen for the 'station' tour preview:
 * the "דלג על התחנה" pill, the exercise rows with their זמן / חזרות chips and the start button.
 */
import { Repeat, Timer } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { legal } from '@/messages/ns/legal';

const ROWS = [
  { name: 'help.preview.station.pullUp', chip: 'help.preview.station.reps', icon: Repeat },
  { name: 'help.preview.station.plank', chip: 'help.preview.station.time', icon: Timer },
  { name: 'help.preview.station.dips', chip: 'help.preview.station.reps', icon: Repeat },
] as const;

export default function PreviewStation() {
  const t = useT(legal);
  return (
    <div className="absolute inset-0 flex flex-col bg-v2-surface text-v2-ink">
      <div className="absolute end-4" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <span className="inline-block rounded-full bg-white px-4 py-1.5 text-[13px] font-bold shadow-v2-card" data-coach="station-skip">{t('help.preview.station.skip')}</span>
      </div>
      <div className="px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}>
        <p className="text-[13px] font-bold text-v2-muted">{t('help.preview.station.progress')}</p>
        <p className="mt-1 text-[24px] font-black">{t('help.preview.station.title')}</p>
        <p className="text-[14px] font-semibold text-v2-ink-2">{t('help.preview.station.duration')}</p>
        <ul className="mt-5 space-y-2.5">
          {ROWS.map((r, i) => (
            <li key={r.name} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-v2-card">
              <span className="text-[15px] font-bold">{t(r.name)}</span>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-v2-tint px-2.5 py-1 text-[12px] font-bold text-v2-deep"
                data-coach={i === 0 ? 'station-chip' : undefined}
              >
                <r.icon size={13} aria-hidden />
                {t(r.chip)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1" />
      <div className="px-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        <div data-coach="station-start">
          <div className="grid h-14 place-items-center rounded-full bg-v2-cta text-[16px] font-bold text-v2-on-cta shadow-v2-cta">{t('help.preview.station.start')}</div>
        </div>
      </div>
    </div>
  );
}
