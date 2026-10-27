/**
 * The top of ל4 / ל4ב (boards WeekPlan / WeekPlanPro): Kelly, "השבוע שלך מוכן!", the real active
 * minutes ring (SegmentedRing: strength cyan, run green, walk orange), the summary line and the
 * program / muscle chips.
 */
import SegmentedRing from '@/components/ui/v2/SegmentedRing';
import { STEPS_WALK_COLORS, TRACK_COLORS } from '@/components/ui/v2/track-colors';
import { LEMUR_COACH_SRC } from './LemurNote';

export interface WeekHeroChip { key: string; label: string; count: string; iconSrc: string }

export interface WeekHeroProps {
  badge: string;
  title: string;
  kellyAlt: string;
  minutes: { strength: number; run: number; walk: number };
  totalLabel: string;
  ringUnit: string;
  ringAria: string;
  legend: { strength: string; run: string; walk: string };
  summary: string;
  chips: WeekHeroChip[];
}

export default function WeekHero(p: WeekHeroProps) {
  const segments = [
    { key: 'strength', value: p.minutes.strength, color: TRACK_COLORS.strength },
    { key: 'run', value: p.minutes.run, color: TRACK_COLORS.run },
    { key: 'walk', value: p.minutes.walk, color: STEPS_WALK_COLORS.fill },
  ].filter((s) => s.value > 0);
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#00baf7] to-[#0cf2e3] p-4 text-[#04222b]">
      <span aria-hidden className="absolute -start-[30px] -top-[30px] h-[140px] w-[140px] rounded-full bg-white/[0.18]" />
      <div className="relative flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LEMUR_COACH_SRC} alt={p.kellyAlt} className="h-[60px] w-[60px] object-contain" />
        <div className="flex min-w-0 flex-col">
          <span className="text-[12px] font-black opacity-80">{p.badge}</span>
          <h1 className="text-[24px] font-black leading-7 !tracking-[-0.02em]">{p.title}</h1>
        </div>
        <span className="ms-auto flex flex-col items-center gap-[3px] rounded-[18px] bg-white px-2 pb-1.5 pt-2 shadow-[0_8px_20px_-14px_rgba(9,30,50,0.5)]">
          <SegmentedRing segments={segments} size={62} stroke={7} gap={3} label={p.ringAria}>
            <span className="text-[15px] font-black tabular-nums text-v2-ink">{p.totalLabel}</span>
          </SegmentedRing>
          <span className="whitespace-nowrap text-[10.5px] font-extrabold text-[#0e1b2a]">{p.ringUnit}</span>
          <span className="flex gap-1.5 whitespace-nowrap text-[10px] font-extrabold">
            {p.minutes.strength > 0 && <span className="text-v2-deep">{p.legend.strength}</span>}
            {p.minutes.run > 0 && <span className="text-[#4d7c0f]">{p.legend.run}</span>}
            {p.minutes.walk > 0 && <span style={{ color: STEPS_WALK_COLORS.text }}>{p.legend.walk}</span>}
          </span>
        </span>
      </div>
      <p className="relative text-[13px] font-bold">{p.summary}</p>
      {p.chips.length > 0 && (
        <div className="relative flex justify-around gap-1 rounded-[18px] bg-white/[0.35] px-1.5 pb-2 pt-2.5">
          {p.chips.map((c) => (
            <span key={c.key} className="flex min-w-0 flex-col items-center gap-[3px]">
              <span className="relative grid h-[38px] w-[38px] place-items-center rounded-full bg-white/90">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.iconSrc} alt="" className="w-[22px]" />
                <span className="absolute -bottom-1 -end-1.5 rounded-full bg-v2-ink px-[5px] text-[10.5px] font-black text-white">{c.count}</span>
              </span>
              <span className="max-w-[84px] truncate text-center text-[11px] font-extrabold">{c.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
