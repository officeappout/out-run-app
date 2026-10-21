/**
 * Gender copy batch 1 (owner decisions 21.10.2026): the visible strings this batch changed,
 * rendered for each of the three genders (male / female / unknown = 'other').
 * Zustand under react-dom/server reads getInitialState(), so the gender goes there.
 * `<!-- -->` (react-dom/server's text-node separator) is stripped before matching.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/lib/haptics', () => ({ hapticLight: () => undefined, hapticMedium: () => undefined }));

import { useLocaleStore } from '@/store/useLocaleStore';
import type { Gender } from '@/lib/i18n/core/i18n-core';
import PauseOverlay from '@/features/workout-engine/players/strength/components/PauseOverlay';
import ResumeWorkoutDialog from '@/features/workout-engine/players/strength/components/ResumeWorkoutDialog';
import PlayerControls from '@/features/workout-engine/players/shared/v2/PlayerControls';
import MapError from '@/app/map/error';

const DEFAULT_GENDER = useLocaleStore.getInitialState().gender;
afterEach(() => {
  Object.assign(useLocaleStore.getInitialState(), { gender: DEFAULT_GENDER });
});

function html(gender: Gender, el: ReactElement): string {
  Object.assign(useLocaleStore.getInitialState(), { gender });
  return renderToStaticMarkup(el).replaceAll('<!-- -->', '');
}

const noop = () => undefined;
const GENDERS: Gender[] = ['male', 'female', 'other'];

describe('player controls', () => {
  it('pause overlay — resume button', () => {
    const out = GENDERS.map((g) => html(g, createElement(PauseOverlay, { onResume: noop, onOpenExitModal: noop })));
    expect(out[0]).toContain('המשך אימון');
    expect(out[1]).toContain('המשיכי אימון');
    expect(out[2]).toContain('ממשיכים באימון');
    expect(out[2]).not.toContain('המשך אימון');
  });

  it('resume-workout dialog', () => {
    const out = GENDERS.map((g) =>
      html(g, createElement(ResumeWorkoutDialog, { elapsedTime: 90, onResume: noop, onStartOver: noop })),
    );
    expect(out[0]).toContain('המשך אימון');
    expect(out[1]).toContain('המשיכי אימון');
    expect(out[2]).toContain('ממשיכים באימון');
  });

  it('player controls — pause / resume aria-label', () => {
    const props = { onPause: noop, onResume: noop, onLap: noop, onStop: noop };
    const paused = GENDERS.map((g) => html(g, createElement(PlayerControls, { ...props, isPaused: true })));
    expect(paused[0]).toContain('aria-label="המשך אימון"');
    expect(paused[1]).toContain('aria-label="המשיכי אימון"');
    expect(paused[2]).toContain('aria-label="ממשיכים באימון"');
    const running = GENDERS.map((g) => html(g, createElement(PlayerControls, { ...props, isPaused: false })));
    expect(running[0]).toContain('aria-label="השהה אימון"');
    expect(running[1]).toContain('aria-label="השהי אימון"');
    expect(running[2]).toContain('aria-label="השהיית אימון"');
  });
});

describe('errors', () => {
  it('map error — retry button', () => {
    const out = GENDERS.map((g) => html(g, createElement(MapError, { error: new Error('x'), reset: noop })));
    expect(out[0]).toContain('נסה שוב');
    expect(out[1]).toContain('נסי שוב');
    expect(out[2]).toContain('נסו שוב');
  });
});
