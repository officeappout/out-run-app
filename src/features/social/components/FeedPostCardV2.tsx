'use client';

/**
 * The home-v2 feed post (design lab "strength post" / "run post", approved
 * 18.10.2026). Presentational — FeedPostCard owns the state (cheer, menu,
 * report, delete) and hands it in.
 *
 *   strength: a tinted hero — program + "שלב X מתוך Y" + level bar when
 *     known, the duration, the top exercises with per-set dots, "ועוד N
 *     תרגילים", the "improved vs last time" badge.
 *   run/walk: a big route-line hero (or the photo, with the line as a small
 *     inset), big numbers, per-lap pace bars when the run had laps.
 * Every section hides itself when its field is missing — nothing invented.
 */
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Flame, Globe, Lock, MapPin, Share2, Trophy, TrendingUp, Users } from 'lucide-react';
import type { FeedPost } from '../services/feed.service';
import { exerciseLine, formatSecPerKm, paceBarHeights, type FeedTopExercise } from '../services/feed-post-details';
import { shareInputFromPost } from '../services/share-image';
import RouteLine from './RouteLine';
import ShareImageSheet from './ShareImageSheet';

/** Activity colours — the same as the home flames. */
export const V2_ACTIVITY: Record<string, { label: string; hex: string; text: string; rgb: string; tint: string }> = {
  strength: { label: 'כוח', hex: '#00baf7', text: '#0284c7', rgb: '0,186,247', tint: 'linear-gradient(160deg,#eef8fc,#dff4fb)' },
  cardio: { label: 'אירובי', hex: '#84cc16', text: '#65a30d', rgb: '132,204,22', tint: 'linear-gradient(165deg,#f3fbe6,#e3f4c8)' },
  maintenance: { label: 'תחזוקה', hex: '#8b5cf6', text: '#7c3aed', rgb: '139,92,246', tint: 'linear-gradient(160deg,#f5f3ff,#ede9fe)' },
};

const V2_AUDIENCE: Record<string, { label: string; Icon: typeof Users }> = {
  partners: { label: 'שותפים', Icon: Users },
  public: { label: 'כולם', Icon: Globe },
  private: { label: 'רק אני', Icon: Lock },
};

export interface FeedPostCardV2Props {
  post: FeedPost;
  timeLabel: string;
  isAuthor: boolean;
  signedIn: boolean;
  reacted: boolean;
  count: number;
  toggling: boolean;
  onKudos: (e: React.MouseEvent) => void;
  onProfile: () => void;
  menu: ReactNode;
  report: ReactNode;
}

function formatPace(pace: number): string {
  const mins = Math.floor(pace);
  const secs = Math.round((pace - mins) * 60);
  return secs === 60 ? `${mins + 1}:00` : `${mins}:${secs.toString().padStart(2, '0')}`;
}

function Avatar({ name, hex, size = 44, ring }: { name: string; hex: string; size?: number; ring?: number }) {
  const inner = (
    <span
      className="grid place-items-center rounded-full font-black text-white ring-2 ring-white"
      style={{ width: ring !== undefined ? size - 6 : size, height: ring !== undefined ? size - 6 : size, background: `linear-gradient(135deg, ${hex}, #0284c7)`, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {name.charAt(0)}
    </span>
  );
  if (ring === undefined) return <span className="shrink-0">{inner}</span>;
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${hex} 0 ${Math.round(ring * 100)}%, #e6edf2 ${Math.round(ring * 100)}% 100%)` }}
    >
      {inner}
    </span>
  );
}

export function StreakChip({ days }: { days: number }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-[#fff4e5] px-1.5 text-[11.5px] font-extrabold text-[#c2410c]">
      <Flame size={11} strokeWidth={2.6} fill="currentColor" aria-hidden />
      רצף {days} ימים
    </span>
  );
}

export function SetDots({ ex, hex, rgb }: { ex: FeedTopExercise; hex: string; rgb: string }) {
  const n = Math.min(ex.sets, 8);
  return (
    <span className="flex shrink-0 gap-[3px]" aria-label={`${ex.setsDone} מתוך ${ex.sets} סטים`}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < ex.setsDone ? hex : `rgba(${rgb},0.28)` }} />
      ))}
    </span>
  );
}

export function PaceBars({ splits }: { splits: number[] }) {
  const heights = paceBarHeights(splits);
  const fastest = Math.min(...splits);
  return (
    <div className="px-4 pb-1 pt-1.5">
      <div className="mb-1.5 whitespace-nowrap text-[12px] font-extrabold text-v2-ink-2">קצב לפי הקפה</div>
      <div className="flex h-[46px] items-end gap-1.5" role="img" aria-label={`קצב לפי הקפה: ${splits.map(formatSecPerKm).join(', ')}`}>
        {splits.map((s, i) => (
          <div
            key={i}
            className="flex-1 rounded-[6px]"
            style={{ height: `${Math.round(heights[i] * 100)}%`, background: s === fastest ? '#65a30d' : `rgba(132,204,22,${0.35 + heights[i] * 0.5})` }}
          />
        ))}
      </div>
    </div>
  );
}

function BigStat({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[24px] font-black leading-none !tracking-[-0.02em] tabular-nums text-v2-ink">{value}</div>
      <div className="mt-1 whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{unit}</div>
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <div className="mx-4 mt-2.5 flex items-center gap-2 rounded-[14px] bg-[#fffbeb] px-3 py-2.5">
      <TrendingUp size={16} strokeWidth={2.6} className="shrink-0 text-[#b45309]" aria-hidden />
      <span className="min-w-0 truncate text-[13px] font-extrabold text-[#92400e]">{text}</span>
    </div>
  );
}

export default function FeedPostCardV2({
  post,
  timeLabel,
  isAuthor,
  signedIn,
  reacted,
  count,
  toggling,
  onKudos,
  onProfile,
  menu,
  report,
}: FeedPostCardV2Props) {
  const [shareOpen, setShareOpen] = useState(false);
  const act = V2_ACTIVITY[post.activityCategory] ?? V2_ACTIVITY.strength;
  const aud = V2_AUDIENCE[post.audience ?? 'partners'] ?? V2_AUDIENCE.partners;
  const AudIcon = aud.Icon;
  const isCardio = post.activityCategory === 'cardio';
  const hasRoute = isCardio && Array.isArray(post.routeShape) && post.routeShape.length >= 6;
  const photo = post.photoUrl;
  const levelKnown = !!post.levelIndex && !!post.levelCount;
  const programLabel = post.programName || post.title;

  const meta = (
    <span className="flex items-center gap-1 whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
      {post.parkName ? <span className="truncate">{post.parkName} ·</span> : null}
      {timeLabel} ·
      <AudIcon size={12} strokeWidth={2.6} aria-label={aud.label} />
    </span>
  );

  const header = (
    <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-3.5">
      <button type="button" onClick={onProfile} className="flex min-w-0 flex-1 items-center gap-2.5 text-start">
        <Avatar name={post.authorName} hex={act.hex} ring={levelKnown ? (post.levelIndex as number) / (post.levelCount as number) : undefined} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-black text-v2-ink">{post.authorName}</span>
            {post.streakDays ? <StreakChip days={post.streakDays} /> : null}
          </span>
          {meta}
        </span>
      </button>
      {menu}
    </div>
  );

  const actions = signedIn && (
    <div className="flex items-center gap-1.5 px-2 pb-2 pt-3">
      <button
        type="button"
        aria-pressed={reacted}
        onClick={onKudos}
        disabled={toggling}
        className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-extrabold transition-[transform,background-color,color] duration-150 ease-v2 active:scale-[0.97] ${
          reacted ? 'bg-[#fff1e6] text-[#ea580c]' : 'bg-white text-v2-ink-2 shadow-v2-ring'
        }`}
      >
        <Flame size={17} strokeWidth={2.4} fill={reacted ? 'currentColor' : 'none'} aria-hidden />
        {reacted ? 'עודדת' : 'עידוד'}
        {count > 0 && <span className="tabular-nums"> · {count}</span>}
      </button>
      <span className="flex-1" />
      {isAuthor && (
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3.5 text-[13.5px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Share2 size={16} strokeWidth={2.6} aria-hidden />
          שיתוף לרשתות
        </button>
      )}
    </div>
  );

  // Portaled: the feed list sits inside animated (transformed) wrappers,
  // which would trap the sheet's position: fixed.
  const shareSheet =
    isAuthor && shareOpen && typeof document !== 'undefined'
      ? createPortal(<ShareImageSheet open onClose={() => setShareOpen(false)} input={shareInputFromPost(post)} />, document.body)
      : null;

  // ── Run / walk ────────────────────────────────────────────────────────
  if (isCardio) {
    const hero = photo || hasRoute;
    return (
      <article className="overflow-hidden rounded-v2-card bg-white shadow-v2-card" dir="rtl">
        {hero ? (
          <div className="relative h-[210px]" style={{ background: act.tint }}>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={`תמונה מהאימון של ${post.authorName}`} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="absolute inset-x-0 bottom-0 top-10">
                <RouteLine shape={post.routeShape} variant="hero" width={358} height={170} label={`קו המסלול של ${post.authorName}`} />
              </div>
            )}
            {photo && hasRoute && (
              <div className="absolute bottom-3 start-3 h-[74px] w-[74px] overflow-hidden rounded-[16px] bg-white/85 p-1 shadow-v2-ring">
                <RouteLine shape={post.routeShape} variant="hero" width={66} height={66} label={`קו המסלול של ${post.authorName}`} />
              </div>
            )}
            <div className="absolute inset-x-3 top-3 flex items-center gap-2">
              <button type="button" onClick={onProfile} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                <Avatar name={post.authorName} hex={act.hex} size={36} />
                <span className="min-w-0 rounded-full bg-white/80 px-2.5 py-1 backdrop-blur-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-black text-v2-ink">{post.authorName}</span>
                    {post.streakDays ? <StreakChip days={post.streakDays} /> : null}
                  </span>
                  <span className="block truncate whitespace-nowrap text-[11.5px] font-bold text-v2-ink-2">
                    {timeLabel}
                    {post.title ? ` · ${post.title}` : ''}
                  </span>
                </span>
              </button>
              <span className="rounded-full bg-white/80">{menu}</span>
            </div>
            {post.runSegment && (
              <span className="absolute bottom-3 end-3 inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full bg-[#fef3c7] px-2.5 text-[12.5px] font-extrabold text-[#92400e]">
                <Trophy size={13} strokeWidth={2.6} aria-hidden />
                {post.runSegment.replace('k', ' ק״מ')}
              </span>
            )}
          </div>
        ) : (
          <>
            {header}
            {post.title && <h3 className="px-4 text-[17px] font-black leading-snug text-v2-ink">{post.title}</h3>}
          </>
        )}
        {report}

        <div className="grid grid-cols-3 gap-2 px-4 pb-1.5 pt-3.5">
          <BigStat value={post.distanceKm != null ? post.distanceKm.toFixed(1) : '—'} unit="ק״מ" />
          <BigStat value={post.paceMinPerKm != null ? formatPace(post.paceMinPerKm) : '—'} unit="דק׳ לק״מ" />
          <BigStat value={String(post.durationMinutes)} unit="דקות" />
        </div>

        {post.paceSplits && post.paceSplits.length >= 2 && <PaceBars splits={post.paceSplits} />}

        {(post.parkName || (!hero && post.runSegment)) && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-2.5">
            {!hero && post.runSegment && (
              <span className="inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-full bg-[#fef3c7] px-2.5 text-[12px] font-extrabold text-[#92400e]">
                <Trophy size={12} strokeWidth={2.6} aria-hidden />
                {post.runSegment.replace('k', ' ק״מ')}
              </span>
            )}
            {post.parkName && (
              <span className="inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-full bg-v2-tint px-2.5 text-[12px] font-extrabold text-v2-deep">
                <MapPin size={12} strokeWidth={2.6} aria-hidden />
                {post.parkName}
              </span>
            )}
          </div>
        )}

        {actions}
        {shareSheet}
      </article>
    );
  }

  // ── Strength / maintenance ────────────────────────────────────────────
  const exercises = post.topExercises ?? [];
  return (
    <article className="overflow-hidden rounded-v2-card bg-white shadow-v2-card" dir="rtl">
      {header}
      {report}
      {post.title && post.title !== programLabel && <h3 className="px-4 pb-2 text-[17px] font-black leading-snug text-v2-ink">{post.title}</h3>}

      {photo && (
        <div className="mx-3 mb-2 overflow-hidden rounded-[20px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt={`תמונה מהאימון של ${post.authorName}`} className="block aspect-[4/3] w-full object-cover" loading="lazy" />
        </div>
      )}

      <div className="mx-3 rounded-[20px] p-3.5" style={{ background: act.tint }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate whitespace-nowrap text-[12px] font-extrabold" style={{ color: act.text }}>
              {act.label}
              {programLabel ? ` · ${programLabel}` : ''}
            </div>
            <div className="truncate whitespace-nowrap text-[19px] font-black !tracking-[-0.02em] text-v2-ink">
              {levelKnown ? `שלב ${post.levelIndex} מתוך ${post.levelCount}` : act.label === 'כוח' ? 'אימון כוח' : `אימון ${act.label}`}
            </div>
          </div>
          <div className="shrink-0 text-center">
            <div className="text-[26px] font-black leading-none tabular-nums text-v2-ink">{post.durationMinutes}</div>
            <div className="text-[11.5px] font-bold text-v2-ink-2">דקות</div>
          </div>
        </div>
        {levelKnown && (
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/80" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round(((post.levelIndex as number) / (post.levelCount as number)) * 100)}%`, background: 'linear-gradient(90deg,#00baf7,#0cf2e3)' }}
            />
          </div>
        )}

        {exercises.length > 0 ? (
          <div className="mt-3 flex flex-col gap-[7px]">
            {exercises.map((ex, i) => (
              <div key={`${ex.name}-${i}`} className="flex items-center gap-2.5 rounded-[14px] bg-white px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-v2-ink">{ex.name}</span>
                <SetDots ex={ex} hex={act.hex} rgb={act.rgb} />
                <span className="shrink-0 whitespace-nowrap text-[13px] font-extrabold tabular-nums text-v2-ink-2">{exerciseLine(ex)}</span>
              </div>
            ))}
            {post.moreExercises ? (
              <div className="ps-1 text-[12.5px] font-bold" style={{ color: act.text }}>
                ועוד {post.moreExercises} תרגילים
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-white px-2.5 text-[12px] font-extrabold text-v2-ink-2">
              {post.activityCredit} נקודות
            </span>
            {post.intensityLevel && (
              <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-white px-2.5 text-[12px] font-extrabold text-v2-ink-2">
                עצימות {post.intensityLevel}
              </span>
            )}
          </div>
        )}
      </div>

      {post.personalBest && <Badge text={post.personalBest} />}

      {actions}
      {shareSheet}
    </article>
  );
}
