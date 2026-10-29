/**
 * method-info.copy — the method sheet's words, filled with the block's own
 * numbers (enable_method_info_sheet_v1). PURE: takes the caller's `player`
 * translator, so the same copy renders in the app and in unit tests.
 */

import type { PlayerT } from '@/messages/ns/player';
import type { MethodInfoModel } from '../../core/methods/method-info/method-info.model';

export interface MethodCopy {
  title: string;
  lead: string;
  steps: [string, string, string];
  chips: [string, string];
  /** Pyramid wave: "then 5 and 8 on the way back". */
  tail?: string;
}

export const secText = (t: PlayerT, n: number) => t('methodInfo.sec', { n });

function totalText(t: PlayerT, totalSec: number): string {
  const min = totalSec / 60;
  return Number.isInteger(min)
    ? t('methodInfo.min', { n: min })
    : t('methodInfo.minApprox', { n: Math.max(1, Math.round(min)) });
}

function listText(t: PlayerT, values: number[]): string {
  if (values.length <= 1) return values.map(String).join('');
  return t('methodInfo.listAnd', { head: values.slice(0, -1).join(', '), last: String(values[values.length - 1]) });
}

export function methodCopy(model: MethodInfoModel, t: PlayerT): MethodCopy {
  const rest = secText(t, model.restSec);
  switch (model.kind) {
    case 'straight':
      return {
        title: t('methodInfo.straight.title'),
        lead: t('methodInfo.straight.lead'),
        steps: [
          t('methodInfo.straight.step1'),
          t('methodInfo.straight.step2', { rest }),
          t('methodInfo.straight.step3', { sets: model.sets ?? 1 }),
        ],
        chips: [t('methodInfo.straight.chip1', { rest }), t('methodInfo.straight.chip2')],
      };
    case 'superset': {
      const short = secText(t, model.shortRestSec ?? 0);
      return {
        title: t('methodInfo.superset.title'),
        lead: t('methodInfo.superset.lead'),
        steps: [
          t('methodInfo.superset.step1'),
          t('methodInfo.superset.step2', { short }),
          t('methodInfo.superset.step3', { long: rest }),
        ],
        chips: [t('methodInfo.superset.chip1'), t('methodInfo.superset.chip2')],
      };
    }
    case 'pyramidWave':
      return {
        title: model.label,
        lead: t('methodInfo.pyramidWave.lead'),
        steps: [
          t('methodInfo.pyramidWave.step1'),
          t('methodInfo.pyramidWave.step2'),
          t('methodInfo.pyramidWave.step3'),
        ],
        chips: [t('methodInfo.pyramidWave.chip1'), t('methodInfo.pyramidWave.chip2')],
        tail: model.pyramidTail?.length
          ? t('methodInfo.pyramidWave.tail', { list: listText(t, model.pyramidTail) })
          : undefined,
      };
    case 'pyramidPeak': {
      const n = model.peakTarget ?? 0;
      const peak = model.peakUnit === 'hold' ? secText(t, n) : t('methodInfo.reps', { n });
      return {
        title: model.label,
        lead: t('methodInfo.pyramidPeak.lead'),
        steps: [
          t('methodInfo.pyramidPeak.step1'),
          t('methodInfo.pyramidPeak.step2'),
          t('methodInfo.pyramidPeak.step3', { peak }),
        ],
        chips: [t('methodInfo.pyramidPeak.chip1', { peak }), t('methodInfo.pyramidPeak.chip2')],
      };
    }
    case 'tabata': {
      const tb = model.tabata!;
      const work = secText(t, tb.workSec);
      const tabRest = secText(t, tb.restSec);
      const total = totalText(t, tb.totalSec);
      return {
        title: t('methodInfo.tabata.title'),
        lead: t('methodInfo.tabata.lead', { work, rest: tabRest }),
        steps: [
          t('methodInfo.tabata.step1', { work }),
          t('methodInfo.tabata.step2', { rest: tabRest }),
          tb.cycles != null
            ? t('methodInfo.tabata.step3Cycles', { cycles: tb.cycles, members: tb.members, total })
            : t('methodInfo.tabata.step3Intervals', { rounds: tb.rounds, total }),
        ],
        chips: [t('methodInfo.tabata.chip1', { work }), t('methodInfo.tabata.chip2', { work })],
      };
    }
  }
}
