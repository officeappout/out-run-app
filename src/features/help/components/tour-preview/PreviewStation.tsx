/**
 * Static illustration of the guided station welcome screen for the 'station' tour preview:
 * the "דלג על התחנה" pill, the exercise rows with their זמן / חזרות chips and the start button.
 */
import { Repeat, Timer } from 'lucide-react';

const ROWS = [
  { name: 'מתח', chip: 'חזרות', icon: Repeat },
  { name: 'פלאנק', chip: 'זמן', icon: Timer },
  { name: 'מקבילים', chip: 'חזרות', icon: Repeat },
];

export default function PreviewStation() {
  return (
    <div className="absolute inset-0 flex flex-col bg-v2-surface text-v2-ink">
      <div className="absolute left-4" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <span className="inline-block rounded-full bg-white px-4 py-1.5 text-[13px] font-bold shadow-v2-card" data-coach="station-skip">דלג על התחנה</span>
      </div>
      <div className="px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}>
        <p className="text-[13px] font-bold text-v2-muted">תחנה 1 מתוך 3</p>
        <p className="mt-1 text-[24px] font-black">גינת הכושר בפארק</p>
        <p className="text-[14px] font-semibold text-v2-ink-2">כ־8 דקות</p>
        <ul className="mt-5 space-y-2.5">
          {ROWS.map((r, i) => (
            <li key={r.name} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-v2-card">
              <span className="text-[15px] font-bold">{r.name}</span>
              <span
                className="inline-flex items-center gap-1 rounded-full bg-v2-tint px-2.5 py-1 text-[12px] font-bold text-v2-deep"
                data-coach={i === 0 ? 'station-chip' : undefined}
              >
                <r.icon size={13} aria-hidden />
                {r.chip}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1" />
      <div className="px-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        <div data-coach="station-start">
          <div className="grid h-14 place-items-center rounded-full bg-v2-cta text-[16px] font-bold text-v2-on-cta shadow-v2-cta">מתחילים</div>
        </div>
      </div>
    </div>
  );
}
