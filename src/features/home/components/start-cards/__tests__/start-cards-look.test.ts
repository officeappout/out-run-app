/**
 * Home v2 (enable_home_v2) start / add-track cards — they wear the real home
 * card look (AddStrengthProgramCard's photo + white fade, 24px radius, the
 * app's program icons), not a generic tile. Static markup, node env.
 */
import { describe, it, expect, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import ProgramStartCard from '../ProgramStartCard';
import AddTrackCard from '../AddTrackCard';
import ProgramStartSlide from '../ProgramStartSlide';
import ProgramStartCarousel from '../ProgramStartCarousel';
import AddStrengthProgramCard from '../../AddStrengthProgramCard';
import { PROGRAM_START_COPY, ADD_TRACK_CTA, ADD_TRACK_DISMISS } from '../program-start-copy';
import { PROGRAM_TRACK_VISUAL } from '../program-track-visual';

const STRENGTH_IMG = '/images/gateway/card-strength.png';
const RUN_IMG = '/images/onboarding/running/goal-race.jpg';
const FADE = 'bg-gradient-to-t from-white via-white/80 to-transparent';

const startCard = (track: 'strength' | 'running') =>
  renderToStaticMarkup(
    h(ProgramStartCard, {
      track,
      title: PROGRAM_START_COPY[track].title,
      valueLine: PROGRAM_START_COPY[track].valueLine,
      chipLabel: PROGRAM_START_COPY[track].chip,
      onTap: () => {},
    }),
  );

describe('track visuals', () => {
  it('strength = the gateway strength photo; running = the web-sized race JPEG, never the 1.7 MB PNG', () => {
    expect(PROGRAM_TRACK_VISUAL.strength.image).toBe(STRENGTH_IMG);
    expect(PROGRAM_TRACK_VISUAL.running.image).toBe(RUN_IMG);
    expect(PROGRAM_TRACK_VISUAL.running.image).not.toContain('card-running.png');
  });
});

describe('ProgramStartCard — the AddStrengthProgramCard look', () => {
  it.each([
    ['strength', STRENGTH_IMG],
    ['running', RUN_IMG],
  ] as const)('%s: its photo full-bleed under the white fade, 24px radius, program icon, title + chip', (track, img) => {
    const out = startCard(track);
    expect(out).toContain(`data-program-start="${track}"`);
    expect(out).toContain(img);
    expect(out).toContain(FADE);
    expect(out).toContain('rounded-[24px]');
    expect(out).toContain(`data-program-icon="${track}"`);
    expect(out).toContain('<svg');
    expect(out).toContain(PROGRAM_START_COPY[track].title);
    expect(out).toContain(PROGRAM_START_COPY[track].valueLine);
    expect(out).toContain(PROGRAM_START_COPY[track].chip);
    // No ad-hoc / raster icon files.
    expect(out).not.toContain('/icons/programs/');
  });
});

describe('AddTrackCard — an image strip in the same treatment', () => {
  it.each([
    ['running', RUN_IMG],
    ['strength', STRENGTH_IMG],
  ] as const)('%s: photo strip + fade, icon + title, body, CTA and dismiss', (track, img) => {
    const out = renderToStaticMarkup(h(AddTrackCard, { track, profile: null, onDismiss: () => {} }));
    expect(out).toContain(`data-add-track="${track}"`);
    expect(out).toContain(img);
    expect(out).toContain(FADE);
    expect(out).toContain('rounded-[24px]');
    expect(out).toContain(`data-program-icon="${track}"`);
    expect(out).toContain(PROGRAM_START_COPY[track].addTitle);
    expect(out).toContain(PROGRAM_START_COPY[track].addBody);
    expect(out).toContain(ADD_TRACK_CTA);
    expect(out).toContain(ADD_TRACK_DISMISS);
    expect(out).not.toContain('/icons/programs/');
  });
});

describe('ProgramStartSlide (owner 20.10.2026: one card per slide)', () => {
  it.each(['strength', 'running'] as const)('%s: ONE card filling the slide, all its copy', (track) => {
    const out = renderToStaticMarkup(h(ProgramStartSlide, { track, profile: null }));
    expect(out.match(/data-program-start="/g)?.length).toBe(1);
    expect(out).toContain('data-program-start-slide');
    expect(out).toContain('h-full w-full');
    expect(out).not.toContain('flex-1');
    expect(out).toContain(PROGRAM_START_COPY[track].title);
    expect(out).toContain(PROGRAM_START_COPY[track].valueLine);
    expect(out).toContain(PROGRAM_START_COPY[track].chip);
  });
});

describe('ProgramStartCarousel', () => {
  it('the two start cards, each its own slide, in the given order, with the header + hint', () => {
    const out = renderToStaticMarkup(h(ProgramStartCarousel, { order: ['running', 'strength'] as const, profile: null }));
    expect(out).toContain('בואו נבנה לך תוכנית'); // gender batch 2: unknown gender → neutral
    expect(out.indexOf('data-program-start="running"')).toBeLessThan(out.indexOf('data-program-start="strength"'));
    expect(out.match(/data-program-start-slide/g)?.length).toBe(2);
    expect(out).toContain(STRENGTH_IMG);
    expect(out).toContain(RUN_IMG);
  });
});

describe('AddStrengthProgramCard without compact (flag off / other callers)', () => {
  it('is today’s full-width card, unchanged', () => {
    const out = renderToStaticMarkup(h(AddStrengthProgramCard, { profile: null }));
    expect(out).toContain('אימון מותאם אישית למטרות שלך');
    expect(out).toContain('/icons/programs/muscle.svg');
    expect(out).toContain('rounded-[24px] shadow-lg h-32');
    expect(out).not.toContain('data-program-start');
  });
});
