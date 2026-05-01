'use client';

import React from 'react';
import { DEFAULT_LEMUR_IMAGE } from '../hooks/useGroupPresence';

interface PartnerMarkerProps {
  name: string;
  color: string;
  size?: number;
  isUser?: boolean;
  personaImageUrl?: string;
  lemurStage?: number;
}

export default function PartnerMarker({
  name,
  color,
  size = 36,
  isUser = false,
  personaImageUrl,
  lemurStage,
}: PartnerMarkerProps) {
  const imgSrc = personaImageUrl || DEFAULT_LEMUR_IMAGE;

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('');

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size, opacity: isUser ? 1 : 0.72 }}
    >
      {/* Pulsing outer glow — very faint so it doesn't compete with the user marker */}
      <div
        className="absolute rounded-full animate-ping"
        style={{
          inset: -4,
          background: `${color}14`,
          animationDuration: isUser ? '2s' : '3.5s',
        }}
      />
      {/* Steady ring — single-pixel accent */}
      <div
        className="absolute rounded-full"
        style={{
          inset: -1,
          border: `1.5px solid ${color}55`,
        }}
      />
      {/* Lemur avatar — neutral background, slight desaturation */}
      <div
        className="rounded-full flex items-center justify-center overflow-hidden shadow-sm"
        style={{
          width: size,
          height: size,
          backgroundColor: '#64748b',
          filter: isUser ? undefined : 'saturate(0.65)',
          boxShadow: `0 1px 4px rgba(0,0,0,0.18)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={name}
          width={size}
          height={size}
          className="rounded-full object-cover"
          style={{ width: size, height: size }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_LEMUR_IMAGE;
          }}
        />
      </div>

      {/* Lemur stage badge — white circle with L{n} for readability */}
      {lemurStage != null && lemurStage > 0 && (
        <div
          className="absolute flex items-center justify-center rounded-full bg-white shadow-md"
          style={{
            width: size * 0.5,
            height: size * 0.5,
            bottom: -3,
            right: -3,
            border: `2px solid ${color}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}
        >
          <span
            className="font-black text-gray-800 leading-none"
            style={{ fontSize: size * 0.2 }}
          >
            L{lemurStage}
          </span>
        </div>
      )}

      {/* Name tooltip below */}
      <div
        className="absolute text-center whitespace-nowrap pointer-events-none"
        style={{ top: size + 4, left: '50%', transform: 'translateX(-50%)' }}
      >
        <span className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm">
          {initials || name.charAt(0)}
        </span>
      </div>
    </div>
  );
}
