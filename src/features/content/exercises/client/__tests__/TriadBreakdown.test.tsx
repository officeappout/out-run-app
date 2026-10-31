/**
 * Exercise page "פירוט" (HANDSTAND_TRIAD_ENABLED): strength / balance / mobility bars
 * from the handstand/HSPU row scores; nothing for an unscored exercise.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TriadBreakdown from '../components/TriadBreakdown';
import type { Exercise } from '../../core/exercise.types';
import type { LibraryT } from '@/messages/ns/library';

const t = ((key: string, v?: Record<string, unknown>) => (v ? `${key}|${String(v.axis)}` : key)) as LibraryT;
const ex = (rows: unknown[]) => ({ targetPrograms: rows }) as unknown as Exercise;

describe('TriadBreakdown', () => {
  it('shows the three scores in order and the main axis', () => {
    const html = renderToStaticMarkup(
      <TriadBreakdown
        exercise={ex([{ programId: 'handstand', level: 5, strengthScore: 7, balanceScore: 2, mobilityScore: 6 }])}
        t={t}
        headingClass=""
      />,
    );
    expect([...html.matchAll(/aria-valuenow="(\d+)"/g)].map((m) => m[1])).toEqual(['7', '2', '6']);
    expect(html).toContain('exercises.detail.triad.title');
    expect(html).toContain('exercises.detail.triad.mostly|strength');
  });
  it('renders nothing for an unscored exercise', () => {
    expect(renderToStaticMarkup(<TriadBreakdown exercise={ex([{ programId: 'push', level: 5 }])} t={t} headingClass="" />)).toBe('');
  });
});
