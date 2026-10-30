'use client';

/**
 * PostSquare: the post's hero (board PostCard, v101): the user's photo, else a night map with the
 * route (the run-dark-route language: dark ground, faint streets, lime to turquoise line with a
 * glow, "start and end hidden"), else the brand night with the level ring (strength). The title and
 * the three rings sit on it over a dark fade.
 */

import React, { useId } from 'react';
import { routeShapeToSvg } from '../services/feed-route';
import type { PostModel } from './post-model';

const W = 338;
const H = 290;

function NightMap({ route, hiddenEnds }: { route: number[]; hiddenEnds: string }) {
  const id = useId().replace(/:/g, '');
  const svg = routeShapeToSvg(route, W, H - 110, 26);
  return (
    <>
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id={`bg${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#061620" />
            <stop offset=".55" stopColor="#0a2634" />
            <stop offset="1" stopColor="#0c3a44" />
          </linearGradient>
          <linearGradient id={`rt${id}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#a3e635" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          <filter id={`gl${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <rect width={W} height={H} fill={`url(#bg${id})`} />
        <path d="M-10 70 L350 48 M-10 160 L350 182 M80 -10 L60 300 M250 -10 L280 300" stroke="rgba(255,255,255,.07)" strokeWidth="9" fill="none" />
        {svg && (
          <g transform="translate(0 14)">
            <path d={svg.d} stroke={`url(#rt${id})`} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".55" filter={`url(#gl${id})`} />
            <path d={svg.d} stroke={`url(#rt${id})`} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </svg>
      {svg && (
        <span className="absolute end-3.5 top-3 inline-flex h-[22px] items-center rounded-full bg-white/10 px-2 text-[10.5px] font-extrabold text-white/75">{hiddenEnds}</span>
      )}
    </>
  );
}

function BrandNight({ level, levelLabel }: { level: PostModel['level']; levelLabel: string }) {
  const pct = level ? Math.round((level.index / level.count) * 100) : 0;
  return (
    <>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 75% 30%, rgba(0,186,247,.35), transparent 55%), linear-gradient(160deg,#06202b,#0b1820 60%)' }} />
      {level && (
        <span className="absolute start-4 top-4 flex items-center gap-2.5">
          <span className="grid h-[58px] w-[58px] place-items-center rounded-full" style={{ background: `conic-gradient(#00baf7 0 ${pct}%, rgba(255,255,255,.16) ${pct}%)` }}>
            <span className="flex h-[46px] w-[46px] flex-col items-center justify-center rounded-full bg-[#0b1820] leading-tight text-white">
              <span dir="ltr" className="text-[14px] font-black tabular-nums">{`${level.index}/${level.count}`}</span>
              <span className="text-[9px] font-bold opacity-70">{levelLabel}</span>
            </span>
          </span>
        </span>
      )}
    </>
  );
}

export interface PostSquareProps {
  model: PostModel;
  title: string;
  rings: React.ReactNode;
  hiddenEnds: string;
  levelLabel: string;
}

export default function PostSquare({ model, title, rings, hiddenEnds, levelLabel }: PostSquareProps) {
  return (
    <div className="relative mx-2.5 overflow-hidden rounded-[20px] text-white" style={{ height: H }}>
      {model.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={model.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : model.route ? (
        <NightMap route={model.route} hiddenEnds={hiddenEnds} />
      ) : (
        <BrandNight level={model.level} levelLabel={levelLabel} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 38%, rgba(11,18,32,.85) 70%)' }} />
      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2.5">
        <span className="line-clamp-2 text-[20px] font-black leading-6">{title}</span>
        {rings}
      </div>
    </div>
  );
}
