/**
 * Workout insights — client side: the request builder, the API client's fallbacks (never
 * throws, never blocks), the typing speed, and the render fallbacks (no line → no lemur, no
 * Kelly slots → the green card byte-identical).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: { getIdToken: async () => 'tok' } } }));

import { insightExercises, insightKey, strengthInsightRequest } from '../insight-input';
import { __resetInsightCache, fetchWorkoutInsight, linesFromResponse } from '../insight-api';
import { TYPE_TOTAL_MS, typeStepMs } from '../useTypewriter';
import LemurBubble from '../LemurBubble';
import ImprovementCard from '@/components/ui/v2/ImprovementCard';
import type { PhaseSummary } from '../../utils/phase-summary';

const ex = (name: string, done: (number | null)[], improvedBy: number | null = null, unit: 'reps' | 'seconds' = 'reps') => ({
  key: name,
  name,
  unit,
  plannedSets: done.length,
  doneSets: done.filter((d) => d != null).length,
  total: done.reduce<number>((s, d) => s + (d ?? 0), 0),
  sets: done.map((d) => ({ done: d, target: 10, mark: 'full' as const })),
  status: 'done' as const,
  improvedBy,
  best: null,
  previousBest: null,
});
const totals = { setsDone: 0, setsPlanned: 0, reps: 0, workSeconds: 0, exercisesDone: 0, exercisesTotal: 0 };
const PHASES: PhaseSummary[] = [
  { phase: 'warmup', blocks: [{ id: 'w', title: '', exercises: [ex('קפיצות', [20])] }], totals },
  { phase: 'main', blocks: [{ id: 'm', title: '', exercises: [ex('מתח', [10, 8, null], 2), ex('פלאנק', [45], null, 'seconds'), ex('<b>x</b>', [])] }], totals },
];

describe('insight-input', () => {
  it('sends the main phase only, done exercises only, cleaned names', () => {
    const out = insightExercises(PHASES);
    expect(out).toEqual([
      { name: 'מתח', unit: 'reps', sets: [10, 8, 0], improvedBy: 2 },
      { name: 'פלאנק', unit: 'seconds', sets: [45] },
    ]);
  });
  it('same inputs → same key (the level-up screen and the summary share one request)', () => {
    const a = strengthInsightRequest({ durationSec: 1800, phases: PHASES });
    const b = strengthInsightRequest({
      durationSec: 1800,
      phases: PHASES,
      outcome: { kind: 'leaf', programId: 'p', before: { level: 3, percent: 80 }, after: { level: 4, percent: 2 }, leveledUp: true, totalGain: 22, chips: [], isFirstWorkout: false },
    });
    expect(a!.key).toBe(b!.key);
    expect(b!.level).toEqual({ before: 3, after: 4, gainPercent: 22, leveledUp: true });
    expect(insightKey(1801, a!.exercises)).not.toBe(a!.key);
  });
  it('nothing done in the main phase → no request', () => {
    expect(strengthInsightRequest({ durationSec: 600, phases: [PHASES[0]] })).toBeNull();
  });
});

describe('insight-api fallbacks', () => {
  const REQ = strengthInsightRequest({ durationSec: 1800, phases: PHASES })!;
  beforeEach(() => __resetInsightCache());

  it('non-200 / bad body → empty lines', () => {
    expect(linesFromResponse(404, { insight: 'x' })).toEqual({ insight: null, funny: null });
    expect(linesFromResponse(200, null)).toEqual({ insight: null, funny: null });
    expect(linesFromResponse(200, { insight: 'שורה', funny: 3 })).toEqual({ insight: 'שורה', funny: null });
  });
  it('a network error → empty lines, never throws', async () => {
    const f = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(fetchWorkoutInsight(REQ, f)).resolves.toEqual({ insight: null, funny: null });
  });
  it('one request per key (dedupe across screens)', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ insight: 'יפה!', funny: 'הא!' }), { status: 200 })) as unknown as typeof fetch;
    const [a, b] = await Promise.all([fetchWorkoutInsight(REQ, f), fetchWorkoutInsight(REQ, f)]);
    expect(a).toEqual({ insight: 'יפה!', funny: 'הא!' });
    expect(b).toBe(a);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('typing speed', () => {
  it('a whole line lands within 1.2s', () => {
    for (const n of [1, 20, 60, 170]) expect(typeStepMs(n) * n).toBeLessThanOrEqual(TYPE_TOTAL_MS + 8 * n);
    expect(typeStepMs(60) * 60).toBeLessThanOrEqual(TYPE_TOTAL_MS);
    expect(typeStepMs(0)).toBe(0);
  });
});

describe('render fallbacks', () => {
  it('lemur: inactive or no line → nothing; loading → typing dots; reduced motion → full text', () => {
    expect(renderToStaticMarkup(<LemurBubble active={false} line="שלום!" reducedMotion />)).toBe('');
    expect(renderToStaticMarkup(<LemurBubble active line={null} reducedMotion />)).toBe('');
    expect(renderToStaticMarkup(<LemurBubble active line={undefined} reducedMotion />)).toContain('role="status"');
    const html = renderToStaticMarkup(<LemurBubble active line="32 גורי פילים!" reducedMotion />);
    expect(html).toContain('king-lemur.png');
    expect(html.split('32 גורי פילים!').length - 1).toBe(2); // sr-only + typed (complete at once)
  });
  it('green card without Kelly slots renders exactly as before; with slots adds them', () => {
    const items = [{ key: 'a', name: 'מתח', previous: '8', today: '10', delta: 2, unit: 'reps' as const }];
    const plain = renderToStaticMarkup(<ImprovementCard items={items} />);
    expect(renderToStaticMarkup(<ImprovementCard items={items} headerAction={undefined} footer={undefined} />)).toBe(plain);
    const withKelly = renderToStaticMarkup(<ImprovementCard items={items} headerAction={<i id="star" />} footer={<i id="line" />} />);
    expect(withKelly).toContain('id="star"');
    expect(withKelly).toContain('id="line"');
  });
});
