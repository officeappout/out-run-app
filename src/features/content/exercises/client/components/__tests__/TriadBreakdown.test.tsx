// @vitest-environment jsdom
/**
 * Exercise page "פירוט" (HANDSTAND_TRIAD_ENABLED): strength / balance / mobility bars
 * from the handstand/HSPU row scores; nothing for an unscored exercise.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TriadBreakdown from '../TriadBreakdown';
import type { Exercise } from '../../../core/exercise.types';
import type { LibraryT } from '@/messages/ns/library';

const t = ((key: string, v?: Record<string, unknown>) => (v ? `${key}:${JSON.stringify(v)}` : key)) as LibraryT;
const ex = (rows: unknown[]) => ({ targetPrograms: rows }) as unknown as Exercise;

describe('TriadBreakdown', () => {
  it('shows the three scores and the main axis', () => {
    render(
      <TriadBreakdown
        exercise={ex([{ programId: 'handstand', level: 5, strengthScore: 7, balanceScore: 2, mobilityScore: 6 }])}
        t={t}
        headingClass=""
      />,
    );
    const meters = screen.getAllByRole('meter');
    expect(meters.map((m) => m.getAttribute('aria-valuenow'))).toEqual(['7', '2', '6']);
    expect(screen.getByText('exercises.detail.triad.mostly:{"axis":"strength"}')).toBeTruthy();
  });
  it('renders nothing for an unscored exercise', () => {
    const { container } = render(
      <TriadBreakdown exercise={ex([{ programId: 'push', level: 5 }])} t={t} headingClass="" />,
    );
    expect(container.innerHTML).toBe('');
  });
});
