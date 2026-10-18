import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  RIEGEL_EXPONENT,
  predictRaceSeconds,
  predictedRacePaceSecPerKm,
  riegelFromTime,
  targetDistanceKm,
} from '../race-prediction.service';
import { selectRacePrediction } from '@/features/home/utils/race-prediction';
import { generatePlan } from '../running-engine.service';
import { DEFAULT_PACE_MAP_CONFIG } from '../../config/pace-map-config';
import type { PaceProfile, RunProgramTemplate } from '../../types/running.types';

describe('race-prediction.service — one model', () => {
  it('Riegel 1.06 from basePace, reference = target distance', () => {
    expect(RIEGEL_EXPONENT).toBe(1.06);
    expect(predictRaceSeconds(300, 5, 5)).toBe(1500);
    expect(predictRaceSeconds(300, 5, 10)).toBeCloseTo(1500 * Math.pow(2, 1.06), 6);
    expect(riegelFromTime(1500, 5, 10)).toBeCloseTo(predictRaceSeconds(300, 5, 10), 9);
    expect(predictRaceSeconds(0, 5, 5)).toBe(0);
    expect(riegelFromTime(1500, 0, 5)).toBe(0);
  });

  it('race-day pace = the predicted pace at the target distance (= basePace)', () => {
    for (const td of ['3k', '5k', '10k'] as const) {
      const km = targetDistanceKm(td);
      expect(predictedRacePaceSecPerKm(330, td)).toBe(330);
      expect(predictedRacePaceSecPerKm(330, td) * km).toBe(Math.round(predictRaceSeconds(330, km, km)));
    }
    expect(predictedRacePaceSecPerKm(0, '5k')).toBe(0);
  });

  it('home widget main number and race-day pace agree', () => {
    const v = selectRacePrediction({
      basePace: 345,
      targetDistance: '10k',
      history: [],
      isRunner: true,
      runningProgramsEnabled: true,
      now: new Date('2026-10-18T10:00:00Z'),
    });
    expect(v.state).toBe('ready');
    if (v.state !== 'ready') return;
    expect(v.main.seconds).toBe(predictedRacePaceSecPerKm(345, '10k') * 10);
    expect(v.basedOnRuns).toBe(false);
  });

  it('generatePlan race-day block targets the shared prediction, not basePace − offset', () => {
    const profile: PaceProfile = {
      basePace: 330, profileType: 1, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null,
    };
    const template = {
      id: 't', name: 't', targetDistance: '5k', targetProfileTypes: [1], canonicalWeeks: 1,
      weekTemplates: [{ weekNumber: 1, workoutIds: [] }],
      progressionRules: [], volumeCaps: [],
    } as unknown as RunProgramTemplate;
    const { plan } = generatePlan(template, profile, DEFAULT_PACE_MAP_CONFIG, []);
    const last = plan.weeks[plan.weeks.length - 1];
    const race = last?.workouts.find((w) => w.id.startsWith('race_day_'));
    expect(race).toBeTruthy();
    const block = race!.blocks.find((b) => b.id.startsWith('race_main_'))!;
    expect(block.targetPacePercentage?.min).toBe(330);
    expect(block.label).toContain('5:30');
  });

  it('no widget keeps its own Riegel copy', () => {
    const files = [
      '../../../../home/components/RunDetailsDrawer.tsx',
      '../../../../home/components/widgets/RunProgressCircle.tsx',
      '../../../../home/components/rows/RaceAndKmCarousel.tsx',
      '../../../../home/components/widgets/RunForecastWidget.tsx',
      '../../../../home/utils/race-prediction.ts',
      '../running-engine.service.ts',
    ];
    for (const f of files) {
      const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
      expect(src, f).not.toMatch(/Math\.pow\([^)]*1\.06\)/);
      expect(src, f).not.toContain('computePredictedRacePace');
    }
  });
});
