'use client';

import type { ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';
import { RefreshCw } from 'lucide-react';
import Button from './Button';
import IconTile from './IconTile';

export interface ErrorStateAction {
  label: string;
  onClick: () => void;
  /** Optional lucide icon shown before the label. */
  icon?: ComponentType<LucideProps>;
}

export interface ErrorStateProps {
  /** Short, friendly headline (never technical). */
  title: string;
  /** One reassuring line under the title. */
  description?: ReactNode;
  /** lucide icon in the tinted tile. Default: RefreshCw. */
  icon?: ComponentType<LucideProps>;
  /** The one filled CTA (e.g. "נסו שוב" / "המשך אימון"). */
  primaryAction?: ErrorStateAction;
  /** Optional white pill under the CTA (e.g. "לדף הבית"). */
  secondaryAction?: ErrorStateAction;
  /**
   * `screen` — centred in the available area (route `error.tsx` fallbacks).
   * `compact` — a small inline card (a widget that failed inside a screen).
   */
  variant?: 'screen' | 'compact';
  className?: string;
}

/**
 * v2 ErrorState — the friendly "something went wrong" surface. One gradient
 * CTA, an optional secondary white pill, brand-tinted icon tile, no red.
 * Dependency-light on purpose: it renders while something else is broken.
 */
export default function ErrorState({
  title,
  description,
  icon = RefreshCw,
  primaryAction,
  secondaryAction,
  variant = 'screen',
  className = '',
}: ErrorStateProps) {
  if (variant === 'compact') {
    return (
      <div
        dir="rtl"
        role="status"
        data-v2-error-state="compact"
        className={`flex items-center gap-3 rounded-v2-card bg-white p-4 shadow-v2-card ${className}`}
      >
        <IconTile icon={icon} tone="accent" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-v2-ink">{title}</p>
          {description ? (
            <p className="truncate text-[12px] font-bold text-v2-muted">{description}</p>
          ) : null}
        </div>
        {primaryAction ? (
          <button
            type="button"
            onClick={primaryAction.onClick}
            className="h-9 shrink-0 whitespace-nowrap rounded-full bg-white px-4 text-[13px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            {primaryAction.label}
          </button>
        ) : null}
      </div>
    );
  }

  const PrimaryIcon = primaryAction?.icon;
  const SecondaryIcon = secondaryAction?.icon;
  return (
    <div
      dir="rtl"
      role="alert"
      data-v2-error-state="screen"
      className={`flex min-h-[60dvh] flex-col items-center justify-center gap-4 bg-v2-surface px-6 py-10 text-center ${className}`}
    >
      <IconTile icon={icon} tone="accent" size="lg" />
      <div className="flex max-w-xs flex-col gap-1.5">
        <h2 className="text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{title}</h2>
        {description ? (
          <p className="text-[14px] font-bold leading-relaxed text-v2-muted">{description}</p>
        ) : null}
      </div>
      {primaryAction || secondaryAction ? (
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2.5">
          {primaryAction ? (
            <Button variant="primary" size="md" block onClick={primaryAction.onClick} className="h-12 text-[16px]">
              {PrimaryIcon ? <PrimaryIcon size={18} strokeWidth={2.4} aria-hidden /> : null}
              {primaryAction.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-5 text-[15px] font-extrabold text-v2-ink-2 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              {SecondaryIcon ? <SecondaryIcon size={16} strokeWidth={2.4} aria-hidden /> : null}
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
