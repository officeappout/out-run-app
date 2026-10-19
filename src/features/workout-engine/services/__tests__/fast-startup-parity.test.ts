/**
 * enable_fast_startup_v1 OFF → the generator's data reads are exactly today's (live reads, no
 * IndexedDB layer). ON → the persisted layers are used.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const flag = { on: false };
vi.mock('@/lib/fast-startup/flag', () => ({ isFastStartupOn: () => flag.on }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
const getDoc = vi.fn();
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), getDoc: (...a: unknown[]) => getDoc(...a) }));
const getAllPrograms = vi.fn(async () => [{ id: 'live' }]);
vi.mock('@/features/content/programs/core/program.service', () => ({ getAllPrograms: () => getAllPrograms() }));
const getProgramCatalogPersisted = vi.fn(async () => [{ id: 'persisted' }]);
vi.mock('@/features/content/programs/core/program-catalog', () => ({
  getProgramCatalogPersisted: () => getProgramCatalogPersisted(),
}));

beforeEach(() => {
  vi.resetModules();
  getAllPrograms.mockClear();
  getProgramCatalogPersisted.mockClear();
  getDoc.mockReset();
});

describe('getCachedPrograms', () => {
  it('flag off → live getAllPrograms (unchanged)', async () => {
    flag.on = false;
    const { getCachedPrograms } = await import('../program-hierarchy.utils');
    expect(await getCachedPrograms()).toEqual([{ id: 'live' }]);
    expect(getProgramCatalogPersisted).not.toHaveBeenCalled();
  });
  it('flag on → persisted catalog', async () => {
    flag.on = true;
    const { getCachedPrograms } = await import('../program-hierarchy.utils');
    expect(await getCachedPrograms()).toEqual([{ id: 'persisted' }]);
    expect(getAllPrograms).not.toHaveBeenCalled();
  });
});

describe('fetchTrioLabels', () => {
  const docData = {
    trainingLabels: { option1Label: 'א', option2Label: 'ב', option3Label: 'ג' },
    restDayLabels: { option1Label: 'ד', option2Label: 'ה', option3Label: 'ו' },
  };
  it('flag off → one live read per call (unchanged)', async () => {
    flag.on = false;
    getDoc.mockResolvedValue({ exists: () => true, data: () => docData });
    const { fetchTrioLabels } = await import('../trio-labels.service');
    const a = await fetchTrioLabels();
    await fetchTrioLabels();
    expect(a.source).toBe('firestore');
    expect(a.labels.trainingLabels.option1Label).toBe('א');
    expect(getDoc).toHaveBeenCalledTimes(2);
  });
  it('flag on → same labels, one read shared across calls', async () => {
    flag.on = true;
    getDoc.mockResolvedValue({ exists: () => true, data: () => docData });
    const { fetchTrioLabels } = await import('../trio-labels.service');
    const a = await fetchTrioLabels();
    const b = await fetchTrioLabels();
    expect(a).toEqual(b);
    expect(a.labels.trainingLabels.option1Label).toBe('א');
    expect(getDoc).toHaveBeenCalledTimes(1);
  });
  it('flag on → a fallback answer is returned but never cached', async () => {
    flag.on = true;
    getDoc.mockResolvedValueOnce({ exists: () => false, data: () => ({}) });
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => docData });
    const { fetchTrioLabels } = await import('../trio-labels.service');
    expect((await fetchTrioLabels()).source).toBe('fallback');
    expect((await fetchTrioLabels()).source).toBe('firestore');
    expect(getDoc).toHaveBeenCalledTimes(2);
  });
});
