/** Map tour "פארקים" step: the park anchor signal + nearest-pin pick. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { isParkCoachAnchorWanted, nearestToCenter, setParkCoachAnchorWanted } from '../park-coach-anchor';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('park coach anchor', () => {
  it('wanted only while someone asks (counted, release is idempotent per request)', () => {
    expect(isParkCoachAnchorWanted()).toBe(false);
    const a = setParkCoachAnchorWanted(true);
    const b = setParkCoachAnchorWanted(true);
    setParkCoachAnchorWanted(false)();
    expect(isParkCoachAnchorWanted()).toBe(true);
    a();
    expect(isParkCoachAnchorWanted()).toBe(true);
    b();
    expect(isParkCoachAnchorWanted()).toBe(false);
  });
  it('picks the pin nearest the screen centre', () => {
    const c = { x: 100, y: 100 };
    expect(nearestToCenter([], c)).toBeNull();
    const pins = [{ id: 'far', point: { x: 0, y: 0 } }, { id: 'near', point: { x: 110, y: 95 } }, { id: 'mid', point: { x: 160, y: 160 } }];
    expect(nearestToCenter(pins, c)?.id).toBe('near');
  });
  it('the anchor is the map-park target, invisible and inert; AppMap renders it only when asked', () => {
    const anchor = src('../ParkCoachAnchor.tsx');
    expect(anchor).toContain('data-coach="map-park"');
    expect(anchor).toContain('pointer-events-none');
    expect(anchor).toContain("layers: [PIN_LAYER]");
    expect(src('../../AppMap.tsx')).toContain('{parkCoachAnchorWanted && <ParkCoachAnchor />}');
    expect(src('../../../../../../app/map/layers/DiscoverLayer.tsx')).toContain(
      '<ParkCoachAnchorRequest on={(mapTourActive && !mapTourClosed) || mapReplayPending} />',
    );
  });
});
