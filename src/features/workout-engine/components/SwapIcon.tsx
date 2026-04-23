'use client';

import React, { useState, useCallback } from 'react';

const FILTER_GRAY =
  'brightness(0) saturate(100%) invert(73%) sepia(8%) saturate(600%) hue-rotate(176deg) brightness(90%) contrast(92%)';
const FILTER_CYAN =
  'brightness(0) saturate(100%) invert(56%) sepia(85%) saturate(2000%) hue-rotate(165deg) brightness(101%) contrast(97%)';

interface SwapIconProps {
  size?: number;
  onClick?: (e: React.MouseEvent) => void;
  isSwapped?: boolean;
}

export default function SwapIcon({ size = 22, onClick, isSwapped = false }: SwapIconProps) {
  const [spinning, setSpinning] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setSpinning(true);
      onClick?.(e);
      setTimeout(() => setSpinning(false), 600);
    },
    [onClick],
  );

  const isCyan = spinning || isSwapped;

  return (
    <button
      className="flex items-center justify-center flex-shrink-0"
      aria-label="החלף תרגיל"
      onClick={handleClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/icons/ui/swap.svg"
        alt=""
        width={size}
        height={size}
        className={spinning ? 'animate-[swapSpin_0.5s_ease-out]' : ''}
        style={{
          filter: isCyan ? FILTER_CYAN : FILTER_GRAY,
          transition: 'filter 0.25s ease',
        }}
      />
    </button>
  );
}
