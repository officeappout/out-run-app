'use client';

/**
 * WeatherChip — a small, quiet pill on home: temperature + icon, and a short Hebrew
 * hint ONLY when the weather is flagged (rain / heat / uv / cold). Same pill recipe as
 * AnchorLocationChip in both looks (v2: hairline ring, rounded-full; v1: light border),
 * so it sits next to the existing chips without competing with them.
 *
 * Renders nothing when there is no weather (flag off, offline, no location, error).
 */

import React from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import type { HomeWeather } from '../hooks/useWeather';

/** WMO weather code → lucide icon. */
export function iconForWeatherCode(code: number | null, isNight: boolean): LucideIcon {
  if (code == null) return isNight ? Moon : Sun;
  if (code <= 1) return isNight ? Moon : Sun;
  if (code === 2) return isNight ? Cloud : CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return Snowflake;
  if (code >= 95) return CloudLightning;
  return Cloud;
}

export default function WeatherChip({ weather }: { weather: HomeWeather | null }) {
  const v2 = useHomeV2();
  if (!weather || weather.temperatureC == null) return null;

  const { classification } = weather;
  // A rain flag can come from the next 3 hours while it's dry right now — show the
  // rain icon whenever rain is the flag, so the icon and the hint agree.
  const Icon = classification.flag === 'rain' ? CloudRain : iconForWeatherCode(weather.weatherCode, weather.isNight);
  const temp = Math.round(weather.temperatureC);
  const hint = classification.label;
  const accent = classification.flag === 'heat' || classification.flag === 'uv'
    ? 'text-amber-500'
    : v2 ? 'text-[#0284c7]' : 'text-[#00C9F2]';

  return (
    <div
      dir="rtl"
      role="status"
      aria-label={hint ? `מזג האוויר: ${temp} מעלות, ${hint}` : `מזג האוויר: ${temp} מעלות`}
      className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap bg-white dark:bg-slate-800 ${v2 ? 'h-8 ps-2.5 pe-3' : 'px-2.5 py-1'}`}
      style={v2 ? { borderRadius: 999, boxShadow: '0 0 0 1px rgba(14,27,42,0.08)' } : { borderRadius: 10, border: '1px solid #E0E9FF' }}
    >
      <Icon size={15} className={accent} aria-hidden />
      <span className={`text-[13px] tabular-nums ${v2 ? 'font-extrabold text-[#0e1419]' : 'font-bold text-gray-700'} dark:text-gray-200`}>
        {temp}°
      </span>
      {hint && (
        <span className={`truncate text-[12px] ${v2 ? 'font-bold text-v2-muted' : 'font-medium text-gray-500'} dark:text-gray-400`}>
          {hint}
        </span>
      )}
    </div>
  );
}
