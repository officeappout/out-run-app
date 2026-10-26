import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ParkEquipmentTile from '../ParkEquipmentTile';
import { MUSCLE_ICON_PATHS } from '@/lib/muscle-icons.const';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

const eq = (over: Record<string, unknown> = {}): GymEquipment => ({
  id: 'e1', name: 'מתח', muscleGroups: [], primaryMuscle: 'back', brands: [], ...over,
}) as unknown as GymEquipment;

describe('ParkEquipmentTile (owner 26.10)', () => {
  it('no brand line, the muscle icon is back', () => {
    const html = renderToStaticMarkup(<ParkEquipmentTile equipment={eq()} brand="אורבניקס" onSelect={() => {}} />);
    expect(html).not.toContain('אורבניקס');
    expect(html).toContain('data-muscle-icon');
    expect(html).toContain(MUSCLE_ICON_PATHS.back);
  });

  it('no muscle known → no icon slot', () => {
    const html = renderToStaticMarkup(<ParkEquipmentTile equipment={eq({ primaryMuscle: undefined })} brand="" onSelect={() => {}} />);
    expect(html).not.toContain('data-muscle-icon');
  });
});
