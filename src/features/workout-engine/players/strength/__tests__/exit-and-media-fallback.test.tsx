/**
 * S1 — the exit modal's "יציאה בלי שמירה" link (only when the caller can discard).
 * S7 — no video: the exercise photo, else a calm empty state; never the old stock clip.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {}, app: {} }));

import ExitConfirmModal from '../components/ExitConfirmModal';
import ExerciseVideoPlayer from '../components/ExerciseVideoPlayer';
import NoVideoFallback from '../components/NoVideoFallback';

const noop = () => {};

describe('ExitConfirmModal discard link (S1)', () => {
  it('shows "יציאה בלי שמירה" when onDiscard is given', () => {
    const html = renderToStaticMarkup(<ExitConfirmModal isOpen onDismiss={noop} onExit={noop} onDiscard={noop} />);
    expect(html).toContain('יציאה בלי שמירה');
    expect(html).toContain('אני רוצה לסיים את האימון באמצע');
  });
  it('no onDiscard (hybrid station) → no discard link', () => {
    const html = renderToStaticMarkup(<ExitConfirmModal isOpen onDismiss={noop} onExit={noop} />);
    expect(html).not.toContain('יציאה בלי שמירה');
  });
});

describe('no-video fallback (S7)', () => {
  const base = { exerciseId: 'e1', exerciseName: 'מתיחת ירך', exerciseType: 'time' as const, isPaused: false };

  it('no video, with a photo → the photo', () => {
    const html = renderToStaticMarkup(<ExerciseVideoPlayer {...base} videoUrl={null} imageUrl="https://img/stretch.jpg" />);
    expect(html).toContain('src="https://img/stretch.jpg"');
    expect(html).not.toContain('mixkit');
  });
  it('no video, no photo → empty state with the exercise name, no stock clip', () => {
    const html = renderToStaticMarkup(<ExerciseVideoPlayer {...base} videoUrl={null} />);
    expect(html).toContain('no-video-fallback');
    expect(html).toContain('מתיחת ירך');
    expect(html).not.toContain('mixkit');
    expect(html).not.toContain('<video');
  });
  it('a real video still plays as a video', () => {
    const html = renderToStaticMarkup(<ExerciseVideoPlayer {...base} videoUrl="https://x/y.mp4" imageUrl="https://img/stretch.jpg" />);
    expect(html).toContain('<video');
  });
  it('NoVideoFallback alone: photo vs empty state', () => {
    expect(renderToStaticMarkup(<NoVideoFallback exerciseId="a" exerciseName="x" imageUrl="https://i/p.jpg" onReady={noop} />)).toContain('<img');
    expect(renderToStaticMarkup(<NoVideoFallback exerciseId="a" exerciseName="x" onReady={noop} />)).toContain('no-video-fallback');
  });
});
