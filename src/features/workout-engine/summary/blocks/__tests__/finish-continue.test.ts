import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// G7.1 finish & continue — pure option logic + the real summary components
// server-rendered (node env, .ts + createElement; same approach as
// strength-summary-level-ring-guard.test.ts).

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import {
  buildContinuationOptions,
  continuationHref,
  pickNearestPark,
  CONTINUE_PARK_MAX_DISTANCE_M,
} from '../finish-continue.util';
import FinishAndContinueFooter from '../FinishAndContinueFooter';
import HybridSummary from '../../pages/HybridSummary';
import AerobicSummaryView from '../../components/aerobic/AerobicSummaryView';
import { HYBRID_RESULT, aerobicWorkout } from '@/app/debug/design-v2/summary/fixtures';

const noop = () => {};
const noopAsync = async () => {};

// Sderot-ish coordinates; ~0.0045° lat ≈ 500 m.
const POS = { lat: 31.525, lng: 34.596 };
const near = { id: 'p-near', name: 'גינת הכושר', location: { lat: 31.5295, lng: 34.596 } };
const nearer = { id: 'p-nearer', name: 'פארק קרוב', location: { lat: 31.527, lng: 34.596 } };
const far = { id: 'p-far', name: 'רחוק', location: { lat: 31.6, lng: 34.596 } };
const broken = { id: 'p-broken', name: 'שבור', location: { lat: NaN, lng: 34.596 } };

describe('pickNearestPark', () => {
  it('picks the closest park within range and ignores far / broken ones', () => {
    const r = pickNearestPark([far, near, broken, nearer], POS);
    expect(r?.park.id).toBe('p-nearer');
    expect(r!.distanceMeters).toBeLessThan(CONTINUE_PARK_MAX_DISTANCE_M);
    expect(r!.walkingMinutes).toBeGreaterThanOrEqual(1);
  });

  it('returns null with no position or nothing in range', () => {
    expect(pickNearestPark([near], null)).toBeNull();
    expect(pickNearestPark([far], POS)).toBeNull();
    expect(pickNearestPark([], POS)).toBeNull();
  });
});

describe('buildContinuationOptions', () => {
  it('3 options with a nearby park, in order: walk, park, run home', () => {
    const opts = buildContinuationOptions(pickNearestPark([near], POS));
    expect(opts.map((o) => o.kind)).toEqual(['keep_walking', 'park_strength', 'run_home']);
    expect(opts[1].title).toContain('גינת הכושר');
  });

  it('2 options (no park suggestion) when no park is in range', () => {
    expect(buildContinuationOptions(null).map((o) => o.kind)).toEqual(['keep_walking', 'run_home']);
  });

  it('maps every kind onto an existing entry point', () => {
    expect(continuationHref('keep_walking')).toBe('/map?openRun=walking');
    expect(continuationHref('run_home')).toBe('/map?openRun=running');
    expect(continuationHref('park_strength')).toBe('/home');
  });
});

const continuation = { options: buildContinuationOptions(pickNearestPark([near], POS)), onSelect: noop };

describe('FinishAndContinueFooter', () => {
  it('renders a large "סיים אימון" plus one tile per option', () => {
    const html = renderToStaticMarkup(createElement(FinishAndContinueFooter, { continuation, onFinish: noop }));
    expect(html).toContain('סיים אימון');
    expect(html.match(/data-continue-kind=/g)?.length).toBe(3);
  });
});

describe('HybridSummary footer', () => {
  const base = { result: HYBRID_RESULT, calories: 318, streakDays: 4, onFinish: noop };

  it('flag OFF (no continuation prop) = today\'s footer, no continuation row', () => {
    const html = renderToStaticMarkup(createElement(HybridSummary, base));
    expect(html).not.toContain('data-finish-continue');
    expect(html).not.toContain('סיים אימון');
    expect(html).toContain('סיום');
  });

  it('flag ON renders the continuation row + "סיים אימון"', () => {
    const html = renderToStaticMarkup(createElement(HybridSummary, { ...base, continuation }));
    expect(html).toContain('data-finish-continue');
    expect(html).toContain('סיים אימון');
    expect(html).toContain('ממשיכים ללכת');
  });
});

describe('AerobicSummaryView footer', () => {
  const base: any = {
    variant: 'solo',
    activityType: 'walking',
    workout: aerobicWorkout('walking'),
    currentUid: 'u1',
    streakDays: 0,
    onSave: noop,
    onClose: noop,
    groupCtx: null,
    groupLoading: false,
    savedWorkoutId: 'w1',
    renderMap: () => null,
    submitRating: noopAsync,
    deleteLastWorkout: noopAsync,
    deleteWorkoutWithReversal: noopAsync,
  };

  it('flag OFF = today\'s "סיום ושמור" footer', () => {
    const html = renderToStaticMarkup(createElement(AerobicSummaryView, base));
    expect(html).toContain('סיום ושמור');
    expect(html).not.toContain('data-finish-continue');
  });

  it('flag ON (live) renders the continuation footer', () => {
    const html = renderToStaticMarkup(createElement(AerobicSummaryView, { ...base, continuation }));
    expect(html).toContain('data-finish-continue');
    expect(html).not.toContain('סיום ושמור');
  });

  it('history (read-only) ignores the continuation', () => {
    const html = renderToStaticMarkup(
      createElement(AerobicSummaryView, { ...base, isReadOnly: true, continuation }),
    );
    expect(html).not.toContain('data-finish-continue');
    expect(html).toContain('סגור');
  });
});
