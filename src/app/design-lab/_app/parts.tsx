'use client';

import { useId, type ReactNode } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Home, Map as MapIcon, TrendingUp, User, Users, X, Zap } from 'lucide-react';
import { EASE_V2 } from '@/components/ui/v2';
import { pick, useDensity } from './density';

/**
 * Shared pieces for the design-lab app screens: the white fade-out photo
 * hero the app already uses, app icons, the bottom nav, a segmented control,
 * a ring and a smooth line chart. Prototype code — fixtures only.
 */

export const CDN = 'https://vz-b17872ab-7a7.b-cdn.net';
export const thumb = (id: string) => `${CDN}/${id}/thumbnail.jpg`;

/** Photo that fades into the white sheet below it (the app's look). */
export function FadeHero({
  src,
  height = 300,
  children,
  position = '50% 35%',
}: {
  src: string;
  height?: number;
  children?: ReactNode;
  position?: string;
}) {
  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          objectPosition: position,
          WebkitMaskImage: 'linear-gradient(180deg, #000 55%, transparent 100%)',
          maskImage: 'linear-gradient(180deg, #000 55%, transparent 100%)',
        }}
      />
      {children}
    </div>
  );
}

/** One of the app's own SVG icons from /public. */
export function AppIcon({ src, size = 22, className = '' }: { src: string; size?: number; className?: string }) {
  return <img src={src} alt="" aria-hidden width={size} height={size} className={`shrink-0 object-contain ${className}`} />;
}

export const ICON = {
  strength: '/icons/programs/muscle.svg',
  flameStrength: '/assets/icons/ui/flame-strength.svg',
  flameSteps: '/assets/icons/ui/flame-steps.svg',
  flamePlay: '/assets/icons/ui/flame-play.svg',
  walk: '/icons/programs/walking.svg',
  run: '/icons/programs/Run.svg',
  pullBar: '/assets/icons/equipment/pullupbar_park.svg',
  bars: '/assets/icons/equipment/parallel_bars.svg',
  bench: '/assets/icons/equipment/street_bench.svg',
  door: '/assets/icons/equipment/pullup_bar_door.svg',
  chair: '/assets/icons/equipment/chair.svg',
  mat: '/assets/icons/equipment/mat.svg',
  chest: '/icons/muscles/chest.svg',
  back: '/icons/muscles/back.svg',
  shoulders: '/icons/muscles/shoulders.svg',
  triceps: '/icons/muscles/triceps.svg',
};

export function Bolts({ level, size = 14 }: { level: 1 | 2 | 3; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`רמת קושי ${level} מתוך 3`}>
      {[1, 2, 3].map((n) => (
        <Zap
          key={n}
          size={size}
          strokeWidth={2.2}
          aria-hidden
          className={n <= level ? 'fill-v2-accent text-v2-accent' : 'text-v2-pill-border'}
        />
      ))}
    </span>
  );
}

export function GlassClose({ onClick, href, label = 'סגירה' }: { onClick?: () => void; href?: string; label?: string }) {
  const cls =
    'v2-glass-chip grid h-10 w-10 place-items-center rounded-full text-white transition-transform duration-150 ease-v2 active:scale-[0.97]';
  if (href)
    return (
      <Link href={href} aria-label={label} className={cls}>
        <X size={19} strokeWidth={2.6} />
      </Link>
    );
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      <X size={19} strokeWidth={2.6} />
    </button>
  );
}

export function BackBar({ title, eyebrow, href = '/design-lab/home', end }: { title: string; eyebrow?: string; href?: string; end?: ReactNode }) {
  return (
    <header className="sticky top-0 z-[3] flex items-center gap-3 bg-v2-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
      <Link
        href={href}
        aria-label="חזרה"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <ArrowRight size={19} strokeWidth={2.4} />
      </Link>
      <div className="min-w-0 flex-1 text-center">
        {eyebrow && <div className="text-[13px] font-extrabold text-v2-deep">{eyebrow}</div>}
        <div className="truncate text-[19px] font-black leading-tight">{title}</div>
      </div>
      <div className="flex w-11 shrink-0 justify-end">{end}</div>
    </header>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  id,
  dark = false,
}: {
  options: { id: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  id: string;
  dark?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      className="grid rounded-full bg-white p-1 shadow-v2-ring"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`relative h-10 rounded-full text-[14px] font-extrabold transition-colors duration-200 ${
              on ? (dark ? 'text-white' : 'text-v2-on-cta') : 'text-v2-ink-2'
            }`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className={`absolute inset-0 rounded-full ${dark ? 'bg-v2-ink' : 'bg-v2-cta shadow-v2-cta'}`}
                transition={{ duration: reduce ? 0 : 0.32, ease: EASE_V2 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Ring({
  pct,
  size = 120,
  stroke = 14,
  from = '#00baf7',
  to = '#0cf2e3',
  track = '#eef8fc',
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  from?: string;
  to?: string;
  track?: string;
  children?: ReactNode;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p / 100) }}
          transition={{ duration: 1, ease: EASE_V2 }}
        />
      </svg>
      <span className="relative text-center">{children}</span>
    </span>
  );
}

/** Smooth area line chart. RTL: the first point is drawn on the right. */
export function LineChart({
  data,
  goal,
  color = '#00c07a',
  height = 150,
  highlight,
  format = (v) => v.toLocaleString('he-IL'),
}: {
  data: { label: string; value: number }[];
  goal?: number;
  color?: string;
  height?: number;
  highlight?: number;
  format?: (v: number) => string;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const W = 320;
  const H = height;
  const padX = 14;
  const padTop = 26;
  const padBottom = 24;
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value)) * 1.12 || 1;
  const n = data.length;
  const x = (i: number) => W - padX - (i * (W - padX * 2)) / Math.max(1, n - 1);
  const y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBottom);
  const pts = data.map((d, i) => [x(i), y(d.value)] as const);
  let path = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] ?? pts[i];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[i + 2] ?? pts[i + 1];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
  }
  const base = H - padBottom;
  const area = `${path} L ${pts[n - 1][0]} ${base} L ${pts[0][0]} ${base} Z`;
  const hi = highlight ?? n - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label="גרף">
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {goal != null && (
        <g>
          <line x1={padX} x2={W - padX} y1={y(goal)} y2={y(goal)} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 5" />
          <text x={W - padX} y={y(goal) - 6} fontSize="10.5" fontWeight="700" fill="#64748b">
            יעד {format(goal)}
          </text>
        </g>
      )}
      <motion.path
        d={area}
        fill={`url(#${id}-a)`}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      />
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: EASE_V2 }}
      />
      {pts.map(([px, py], i) => (
        <g key={i}>
          {i === hi ? (
            <>
              <circle cx={px} cy={py} r="7" fill={color} opacity="0.18" />
              <circle cx={px} cy={py} r="4.5" fill="#fff" stroke={color} strokeWidth="2.5" />
              <text x={px} y={py - 12} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0e1419">
                {format(data[i].value)}
              </text>
            </>
          ) : (
            <circle cx={px} cy={py} r="2.5" fill={color} opacity="0.55" />
          )}
          <text x={px} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight={i === hi ? 800 : 700} fill={i === hi ? '#0e1419' : '#64748b'}>
            {data[i].label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export type NavTab = 'home' | 'map' | 'progress' | 'friends';
/**
 * equal  — four equal tabs (today).
 * pill   — the current tab grows into a brand pill with its label; the rest
 *          are icons only, so "where am I" reads first.
 * map    — the map is the hero: a raised gradient button in the centre.
 */
export type NavVariant = 'equal' | 'pill' | 'map';

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof Home; href: string }[] = [
  { id: 'home', label: 'בית', icon: Home, href: '/design-lab/home' },
  { id: 'progress', label: 'התקדמות', icon: TrendingUp, href: '/design-lab/steps' },
  { id: 'map', label: 'מפה', icon: MapIcon, href: '/design-lab/park' },
  { id: 'friends', label: 'חברתי', icon: Users, href: '/design-lab/leagues' },
];

/** The app's four tabs (בית · מפה · התקדמות · חברתי), on the site's glass bar. */
export function BottomNav({ active = 'home', variant = 'equal' }: { active?: NavTab; variant?: NavVariant }) {
  const reduce = useReducedMotion();
  const d = useDensity();
  const bar = `v2-glass-bar fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+14px)] z-[5] flex ${pick(
    d,
    'h-16',
    'h-[58px]',
    'h-14',
  )} items-center rounded-full shadow-v2-float`;

  if (variant === 'map') {
    const side = NAV_ITEMS.filter((i) => i.id !== 'map');
    const map = NAV_ITEMS.find((i) => i.id === 'map')!;
    const left = [side[0], side[1]];
    // 2 + map + 2: profile joins the bar in this variant to keep it symmetric.
    const right = [side[2], { id: 'profile' as NavTab, label: 'פרופיל', icon: User, href: '/design-lab/home' }];
    const tab = ({ id, label, icon: Icon, href }: (typeof NAV_ITEMS)[number]) => {
      const on = id === active;
      return (
        <Link
          key={id}
          href={href}
          aria-current={on ? 'page' : undefined}
          className={`flex h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-extrabold ${on ? 'text-v2-deep' : 'text-v2-muted'}`}
        >
          <Icon size={21} strokeWidth={on ? 2.6 : 2.2} aria-hidden />
          {label}
        </Link>
      );
    };
    return (
      <nav aria-label="ניווט ראשי" className={`${bar} justify-around px-2`}>
        {left.map(tab)}
        <Link
          href={map.href}
          aria-label={map.label}
          aria-current={active === 'map' ? 'page' : undefined}
          className="-mt-9 grid h-[64px] w-[64px] shrink-0 place-items-center rounded-full bg-white text-v2-deep shadow-v2-float ring-1 ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.96]"
        >
          <MapIcon size={28} strokeWidth={2.4} aria-hidden />
        </Link>
        {right.map(tab)}
      </nav>
    );
  }

  return (
    <nav aria-label="ניווט ראשי" className={`${bar} justify-around px-2`}>
      {NAV_ITEMS.map(({ id, label, icon: Icon, href }) => {
        const on = id === active;
        if (variant === 'pill')
          return (
            <Link
              key={id}
              href={href}
              aria-current={on ? 'page' : undefined}
              aria-label={label}
              className={`relative flex h-11 items-center justify-center gap-1.5 rounded-full text-[13.5px] font-extrabold transition-colors duration-200 ${
                on ? 'px-4 text-v2-on-cta' : 'w-12 text-v2-muted'
              }`}
            >
              {on && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-v2-cta shadow-v2-cta"
                  transition={{ duration: reduce ? 0 : 0.32, ease: EASE_V2 }}
                />
              )}
              <Icon size={21} strokeWidth={on ? 2.6 : 2.2} className="relative" aria-hidden />
              {on && <span className="relative">{label}</span>}
            </Link>
          );
        return (
          <Link
            key={id}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={`flex h-12 min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
              on ? 'text-v2-deep' : 'text-v2-muted'
            }`}
          >
            <Icon size={21} strokeWidth={on ? 2.6 : 2.2} aria-hidden />
            {label}
            <span className={`h-1 w-4 rounded-full ${on ? 'bg-v2-cta' : 'bg-transparent'}`} />
          </Link>
        );
      })}
    </nav>
  );
}

/** Overlapping initials avatars, then "+n". */
export function Faces({ letters = ['מ', 'ש', 'נ'], more }: { letters?: string[]; more?: number }) {
  const tints = ['#bae6fd', '#c7f9e9', '#fde68a', '#e9d5ff'];
  return (
    <span className="flex items-center">
      <span className="flex -space-x-2 space-x-reverse">
        {letters.map((l, i) => (
          <span
            key={i}
            className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-black text-v2-ink ring-2 ring-white"
            style={{ background: tints[i % tints.length] }}
          >
            {l}
          </span>
        ))}
      </span>
      {more != null && <span className="ms-1.5 text-[13px] font-extrabold text-v2-ink-2">+{more}</span>}
    </span>
  );
}

/** Fixture photos: a /public path, or `thumb:<id>` for a library thumbnail. */
export const photo = (p: string) => (p.startsWith('thumb:') ? thumb(p.slice(6)) : p);
