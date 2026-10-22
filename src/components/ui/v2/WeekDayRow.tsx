'use client';

/**
 * WeekDayRow + WeekSessionPiece — one day of a proposed week, in the agenda's row
 * language (the day letter + date column, a hairline, then the day's sessions). Used by
 * the schedule proposals (add-track combined week, boards sch/S-6b / S-6c); the run
 * signup's week step (RunWeekStep) draws the same row.
 *
 *   <WeekDayRow letter="ב" date={26} muted={false} emptyLabel="מנוחה">
 *     <WeekSessionPiece icon={<IconTile … />} title="ריצת איכות" subtitle="בוקר · 07:00"
 *       tag={{ label: 'חדש', tone: 'new' }} note={{ text: 'ריצת האיכות ביום בלי כוח' }} />
 *   </WeekDayRow>
 */
import type { ReactNode } from 'react';
import { ArrowLeftRight, Check, Info } from 'lucide-react';

export type WeekSessionTagTone = 'new' | 'moved' | 'done' | 'missed';
export type WeekSessionNoteTone = 'info' | 'kept' | 'moved';

const TAG_CLASS: Record<WeekSessionTagTone, string> = {
  new: 'bg-emerald-50 text-emerald-700',
  moved: 'bg-amber-50 text-amber-700',
  done: 'bg-v2-tint text-v2-deep',
  missed: 'bg-rose-50 text-rose-700',
};

const NOTE_CLASS: Record<WeekSessionNoteTone, string> = {
  info: 'text-v2-deep',
  kept: 'text-v2-deep',
  moved: 'text-orange-700',
};

const NOTE_ICON = { info: Info, kept: Check, moved: ArrowLeftRight } as const;

export interface WeekSessionPieceProps {
  /** Leading tile (IconTile / a program icon in a tile). */
  icon: ReactNode;
  title: string;
  subtitle?: string;
  /** Small status pill at the end ("חדש" / "הוזז"). */
  tag?: { label: string; tone: WeekSessionTagTone } | null;
  /** One line under the piece: the reason / "נשאר כמו שהיה" / "הוזז: … · כי …". */
  note?: { text: string; tone?: WeekSessionNoteTone } | null;
  /** Let a long subtitle take up to two lines instead of truncating to one. Default false. */
  wrapSubtitle?: boolean;
  /** At the row's end, after the tag (the week builder's drag handle). */
  trailing?: ReactNode;
}

export function WeekSessionPiece({ icon, title, subtitle, tag, note, wrapSubtitle = false, trailing }: WeekSessionPieceProps) {
  const tone = note?.tone ?? 'info';
  const NoteIcon = NOTE_ICON[tone];
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-h-[52px] items-center gap-2.5 rounded-[14px] bg-v2-surface px-2.5 py-2">
        {icon}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate whitespace-nowrap text-[15px] font-extrabold text-v2-ink">{title}</span>
          {subtitle && (
            <span className={`${wrapSubtitle ? 'line-clamp-2 leading-snug' : 'truncate whitespace-nowrap'} text-[12px] font-bold text-v2-muted`}>{subtitle}</span>
          )}
        </span>
        {tag && (
          <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold ${TAG_CLASS[tag.tone]}`}>{tag.label}</span>
        )}
        {trailing}
      </div>
      {note?.text && (
        <p className={`flex items-center gap-1.5 whitespace-nowrap text-[12px] font-bold ${NOTE_CLASS[tone]}`}>
          <NoteIcon size={13} strokeWidth={2.2} aria-hidden className="shrink-0" />
          <span className="truncate">{note.text}</span>
        </p>
      )}
    </div>
  );
}

export interface WeekDayRowProps {
  /** Hebrew day letter without the geresh ("א"). */
  letter: string;
  /** Day of month. */
  date: number;
  /** Grey date (no session that day). */
  muted?: boolean;
  /** Shown instead of children when the day has no session ("מנוחה"). */
  emptyLabel?: string;
  /** Hairline above (every row but the first). */
  divider?: boolean;
  /** Makes the date column a button (the week builder: tap the date to edit the day). */
  onDateTap?: () => void;
  /** aria-label of that button. */
  dateAriaLabel?: string;
  children?: ReactNode;
}

export default function WeekDayRow({ letter, date, muted = false, emptyLabel, divider = false, onDateTap, dateAriaLabel, children }: WeekDayRowProps) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : !!children;
  return (
    <div className={`flex gap-3 px-3 py-2.5 ${divider ? 'border-t border-v2-hairline' : ''}`}>
      {onDateTap ? (
        <button
          type="button"
          onClick={onDateTap}
          aria-label={dateAriaLabel}
          className="w-10 shrink-0 rounded-[12px] pt-1 text-center transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <span className="block text-[12px] font-extrabold text-v2-muted">{letter}׳</span>
          <span className={`mx-auto mt-0.5 block text-[16px] font-black tabular-nums underline decoration-v2-hairline decoration-2 underline-offset-4 ${muted ? 'text-v2-muted' : 'text-v2-ink'}`}>{date}</span>
        </button>
      ) : (
        <div className="w-10 shrink-0 pt-1 text-center">
          <span className="block text-[12px] font-extrabold text-v2-muted">{letter}׳</span>
          <span className={`mx-auto mt-0.5 block text-[16px] font-black tabular-nums ${muted ? 'text-v2-muted' : 'text-v2-ink'}`}>{date}</span>
        </div>
      )}
      <span aria-hidden className="w-px shrink-0 self-stretch bg-v2-hairline" />
      {hasContent ? (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">{children}</div>
      ) : (
        <div className="flex h-11 flex-1 items-center">
          <span className="whitespace-nowrap text-[14px] font-bold text-v2-muted">{emptyLabel}</span>
        </div>
      )}
    </div>
  );
}
