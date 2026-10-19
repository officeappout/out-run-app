'use client';

import type { ReactNode } from 'react';

export type SectionHeaderSize = 15 | 16 | 17;

const TITLE_SIZE: Record<SectionHeaderSize, string> = {
  15: 'text-[15px]',
  16: 'text-[16px]',
  17: 'text-[17px]',
};

export interface SectionHeaderProps {
  title: ReactNode;
  /** Small brand label above the title (13px extrabold, deep cyan). */
  eyebrow?: ReactNode;
  /**
   * Optional trailing link ("הכל", "עוד…"): an `href` renders an <a>,
   * an `onClick` renders a <button>.
   */
  action?: { label: ReactNode; onClick?: () => void; href?: string; ariaLabel?: string };
  /** Title size in px. Default 17. */
  size?: SectionHeaderSize;
  /** Heading element. Default h2. */
  as?: 'h2' | 'h3' | 'h4';
  className?: string;
}

/**
 * v2 SectionHeader — a section's title row: optional eyebrow, black title
 * (never wraps, truncates), optional action link on the far side.
 *
 *   <SectionHeader title="אימונים קרובים" action={{ label: 'הכל', onClick: openAll }} />
 */
export default function SectionHeader({
  title,
  eyebrow,
  action,
  size = 17,
  as: Heading = 'h2',
  className = '',
}: SectionHeaderProps) {
  const actionClass =
    'shrink-0 whitespace-nowrap text-[13px] font-extrabold text-v2-deep transition-transform duration-150 ease-v2 active:scale-[0.97]';
  return (
    <div data-v2-section-header className={`flex items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-0.5 truncate whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{eyebrow}</div>}
        <Heading className={`truncate whitespace-nowrap font-black text-v2-ink ${TITLE_SIZE[size]}`}>{title}</Heading>
      </div>
      {action && (action.href ? (
        <a href={action.href} aria-label={action.ariaLabel} onClick={action.onClick} className={actionClass}>
          {action.label}
        </a>
      ) : (
        <button type="button" aria-label={action.ariaLabel} onClick={action.onClick} className={actionClass}>
          {action.label}
        </button>
      ))}
    </div>
  );
}
