/** routeScore — combine the six components into one 0-100 score, confidence and band. */
import { scoreComfort, scoreExperience, scoreGeometry, scoreSafety, scoreSource, scoreSurface } from './components';
import type { RouteScore, RouteScoreInput, ScoreBand, ScoreComponentKey, ComponentScore, CertificateVerdict } from './types';
import { BAND_THRESHOLDS, ROUTE_SCORE_VERSION } from './weights';

export function routeScore(input: RouteScoreInput): RouteScore {
  const components: Record<ScoreComponentKey, ComponentScore> = {
    surface: scoreSurface(input),
    geometry: scoreGeometry(input),
    safety: scoreSafety(input),
    source: scoreSource(input),
    comfort: scoreComfort(input),
    experience: scoreExperience(input),
  };
  let score = 0;
  let measuredWeight = 0;
  let totalWeight = 0;
  for (const c of Object.values(components)) {
    score += c.points;
    measuredWeight += c.max * c.coverage;
    totalWeight += c.max;
  }
  const finalScore = Math.round(Math.max(0, Math.min(100, score)));
  const confidence = Math.round((measuredWeight / totalWeight) * 100) / 100;
  return {
    score: finalScore,
    confidence,
    band: scoreBand(finalScore, confidence, input.certificate),
    components,
    version: ROUTE_SCORE_VERSION,
  };
}

/**
 * green  — score ≥75, confidence ≥0.8 and certificate approve (§3.3).
 * red    — score <40, or certificate drop.
 * yellow — everything else (incl. a high score with no certificate yet).
 */
export function scoreBand(score: number, confidence: number, certificate: CertificateVerdict | null): ScoreBand {
  if (certificate === 'drop' || score < BAND_THRESHOLDS.redMaxScore) return 'red';
  if (
    score >= BAND_THRESHOLDS.greenMinScore &&
    confidence >= BAND_THRESHOLDS.greenMinConfidence &&
    certificate === 'approve'
  ) return 'green';
  return 'yellow';
}
