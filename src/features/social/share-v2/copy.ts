/**
 * Share images v2: every word the model and the canvas templates draw, from the `social` catalog (`shareV2.*`).
 * Pure modules (no React): the translator reads the current locale at call time. Strings that templates COMPARE
 * (the streak unit, the fastest-lap unit, the default strength name) come from these helpers on both sides, so a
 * comparison and the text it matches never drift apart.
 */
import { makeLiveT } from '@/lib/i18n/live-t';
import { common } from '@/messages/ns/common';
import { social } from '@/messages/ns/social';

export const shareT = makeLiveT(social);
/** The shared unit / weekday words (`common`), passed to unitLabel / weekdayLabel. */
export const shareCommonT = makeLiveT(common);

export const strengthDefaultName = () => shareT('shareV2.strength.name');
export const streakUnit = () => shareT('shareV2.unit.streak');
export const fastestLapUnit = () => shareT('shareV2.unit.fastestLap');
export const streakLineText = (days: number) => shareT('shareV2.streakLine', { days });
export const stageText = (index: number) => shareT('shareV2.stage.n', { index });
export const stageOfText = (index: number, count: number) => shareT('shareV2.stage.nOfN', { index, count });
