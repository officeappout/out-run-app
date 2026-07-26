import { describe, it, expect } from 'vitest';
import { generatedToHeroWorkout } from '../generatedToHeroWorkout';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';

/** Minimal GeneratedWorkout stub — the adapter only reads a handful of fields. */
const gw = (over: Partial<GeneratedWorkout> = {}): GeneratedWorkout =>
  ({
    title: 'אימון כוח',
    description: 'תיאור',
    exercises: [],
    estimatedDuration: 30,
    structure: 'standard',
    difficulty: 2,
    mechanicalBalance: {},
    stats: { calories: 120, coins: 120, totalReps: 0, totalHoldTime: 0, difficultyMultiplier: 1 },
    isRecovery: false,
    totalPlannedSets: 0,
    ...over,
  } as unknown as GeneratedWorkout);

describe('generatedToHeroWorkout — R Track 1 hero adapter', () => {
  it('maps title, duration, difficulty', () => {
    const h = generatedToHeroWorkout(gw({ title: 'רגליים', estimatedDuration: 45, difficulty: 3 }));
    expect(h.title).toBe('רגליים');
    expect(h.duration).toBe(45);
    expect(h.difficulty).toBe(3);
  });

  it('type = strength when not recovery', () => {
    expect(generatedToHeroWorkout(gw({ isRecovery: false })).type).toBe('strength');
  });

  it('type = recovery + isRecovery flag when recovery', () => {
    const h = generatedToHeroWorkout(gw({ isRecovery: true }));
    expect(h.type).toBe('recovery');
    expect(h.isRecovery).toBe(true);
  });

  it('defaults calories/coins to 0 when stats missing', () => {
    const h = generatedToHeroWorkout(gw({ stats: undefined as never }));
    expect(h.calories).toBe(0);
    expect(h.coins).toBe(0);
  });

  it('carries no image (hero variant is imageless / media comes from exercises)', () => {
    expect(generatedToHeroWorkout(gw()).imageUrl).toBe('');
  });
});
