import { describe, it, expect, vi, afterEach } from 'vitest';
import { findMissingDetailFields, logParkDetailTripwireIfIncomplete } from '../park-detail-completeness';

describe('findMissingDetailFields', () => {
  it('flags every detail-critical field missing on a catalog-shaped (lean) park', () => {
    const catalogPark: any = { id: 'p1', facilityType: 'gym_park', isFunctional: true };
    expect(findMissingDetailFields(catalogPark)).toEqual(
      expect.arrayContaining(['description', 'featureTags', 'city', 'status', 'gymEquipment']),
    );
  });

  it('returns [] for a full-record park with every field present', () => {
    const fullPark: any = {
      id: 'p1', facilityType: 'gym_park',
      description: 'x', featureTags: [], city: 'תל אביב', status: 'open', gymEquipment: [],
    };
    expect(findMissingDetailFields(fullPark)).toEqual([]);
  });

  it('does not require gymEquipment for a non-gym_park facility', () => {
    const fullPark: any = {
      id: 'p1', facilityType: 'urban_spot',
      description: 'x', featureTags: [], city: 'x', status: 'open',
    };
    expect(findMissingDetailFields(fullPark)).toEqual([]);
  });

  it('treats an empty-but-present array/string as complete, not missing', () => {
    const edgePark: any = {
      id: 'p1', facilityType: 'gym_park',
      description: '', featureTags: [], city: '', status: 'open', gymEquipment: [],
    };
    expect(findMissingDetailFields(edgePark)).toEqual([]);
  });

  it('returns [] for a null/undefined park (nothing to warn about yet)', () => {
    expect(findMissingDetailFields(null)).toEqual([]);
    expect(findMissingDetailFields(undefined)).toEqual([]);
  });
});

describe('logParkDetailTripwireIfIncomplete — calls the fallback path directly', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns with the TRIPWIRE tag, the missing fields, and the park id when incomplete', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const catalogPark: any = { id: 'V7aVC8sIVUNRnlQdT61C', facilityType: 'gym_park' };

    logParkDetailTripwireIfIncomplete(catalogPark, 'point-fetch not yet resolved or failed');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('TRIPWIRE');
    expect(message).toContain('V7aVC8sIVUNRnlQdT61C');
    expect(message).toContain('description');
    expect(message).toContain('gymEquipment');
    expect(message).toContain('point-fetch not yet resolved or failed');
  });

  it('does not warn when the fallback object is already complete', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fullPark: any = {
      id: 'p1', facilityType: 'gym_park',
      description: 'x', featureTags: [], city: 'x', status: 'open', gymEquipment: [],
    };

    logParkDetailTripwireIfIncomplete(fullPark, 'point-fetch not yet resolved or failed');

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
