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
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Pulsing outer glow */}
      <div
        className="absolute rounded-full animate-ping"
        style={{
          inset: -4,
          background: `${color}30`,
          animationDuration: isUser ? '2s' : '2.5s',
        }}
      />
      {/* Steady ring */}
      <div
        className="absolute rounded-full"
        style={{
          inset: -2,
          border: `2px solid ${color}80`,
        }}
      />
      {/* Lemur avatar */}
      <div
        className="rounded-full flex items-center justify-center overflow-hidden shadow-lg"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          boxShadow: `0 2px 8px ${color}60`,
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
