import { withUnit } from '@/lib/i18n/units';

const getDistanceStr = (distance: number): string => {
  if (distance >= 1000) {
    return withUnit('kmAscii', (distance / 1000).toFixed(1));
  }
  return withUnit('mAscii', Math.round(distance));
};

export default getDistanceStr;