/**
 * The 6 fixed measurement starts — single source in the admin A/B page's
 * presets, so the PR table and /admin/routes/quality talk about the same points.
 */
import { QUALITY_START_PRESETS, type QualityStartPreset } from '../../src/features/admin/components/routes/route-quality/presets';

export type MeasureStart = QualityStartPreset;
export const MEASURE_STARTS: MeasureStart[] = QUALITY_START_PRESETS;
export const MEASURE_TARGETS_KM = [3, 5];
