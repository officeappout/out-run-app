/** A workout card of a day (strength / run): icon, title, minutes line, time. */
import CardCheck from './CardCheck';
import type { DayCardSize, TimeTone, WorkoutCardData } from './types';

export const TIME_TONE_COLOR: Record<TimeTone, string> = {
  morning: '#00C9F2',
  noon: '#0284c7',
  evening: '#E07A00',
  run: '#4d7c0f',
};

export default function WorkoutDayCard({ card, size = 'row' }: { card: WorkoutCardData; size?: DayCardSize }) {
  const run = card.tone === 'run';
  const home = size === 'home';
  return (
    <div
      className={`relative flex items-center gap-2 px-2.5 py-1.5 shadow-[0_0_0_1px_rgba(14,27,42,0.06),0_1px_2px_rgba(14,27,42,0.06)] ${
        home ? 'min-h-[72px] w-[200px] rounded-[18px]' : `min-h-[48px] rounded-[14px] ${run ? 'w-[170px]' : 'w-[176px]'}`
      } ${run ? 'bg-[#f6fce9]' : 'bg-white'}`}
    >
      <CardCheck done={card.done} />
      {card.iconSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.iconSrc} alt="" className="h-5 w-5 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-extrabold leading-[1.2]">{card.title}</span>
        {card.subtitle && <span className="block truncate text-[11.5px] font-bold text-v2-muted">{card.subtitle}</span>}
      </span>
      {card.time && (
        <span dir="ltr" className="shrink-0 whitespace-nowrap text-[11px] font-bold" style={{ color: TIME_TONE_COLOR[card.timeTone ?? (run ? 'run' : 'morning')] }}>
          {card.time}
        </span>
      )}
    </div>
  );
}
