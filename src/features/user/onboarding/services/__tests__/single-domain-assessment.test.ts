import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the underlying writer so this test verifies the WRAPPER's contract
// (shapes a single-domain payload, calls the existing writer, does not
// reimplement Ghost Purge / offset logic) without touching Firebase.
const syncMock = vi.fn().mockResolvedValue(true);
vi.mock('../onboarding-sync.service', () => ({
  syncOnboardingToFirestore: (...args: unknown[]) => syncMock(...args),
}));

import {
  buildSingleDomainAssignedResult,
  writeSingleDomainAssessment,
  PRIMARY_CATEGORIES,
} from '../single-domain-assessment.service';

describe('buildSingleDomainAssignedResult — single-domain write shape', () => {
  it('sets ONLY the target domain to a non-zero level; all other primary categories are zeroed', () => {
    const [entry] = buildSingleDomainAssignedResult('legs', 12);
    expect(entry.programId).toBe('legs');
    expect(entry.levelId).toBe('legs_level_12');
    expect(entry.masterProgramSubLevels.legs).toBe(12);
    for (const cat of PRIMARY_CATEGORIES) {
      if (cat === 'legs') continue;
      expect(entry.masterProgramSubLevels[cat]).toBe(0);
    }
  });

  it('every primary category is present in masterProgramSubLevels (so the writer\'s ' +
     '"only write childLevel>0" rule can see — and skip — every other category explicitly)', () => {
    const [entry] = buildSingleDomainAssignedResult('push', 5);
    expect(Object.keys(entry.masterProgramSubLevels).sort()).toEqual([...PRIMARY_CATEGORIES].sort());
  });

  it('rounds and floors the level to a safe positive integer', () => {
    const [entry] = buildSingleDomainAssignedResult('core', 7.6);
    expect(entry.masterProgramSubLevels.core).toBe(8);
    expect(entry.levelId).toBe('core_level_8');

    const [entry2] = buildSingleDomainAssignedResult('core', 0);
    expect(entry2.masterProgramSubLevels.core).toBe(1); // never writes a 0/negative level
  });

  it('returns exactly one result entry (not one per category)', () => {
    const result = buildSingleDomainAssignedResult('pull', 9);
    expect(result).toHaveLength(1);
  });
});

describe('writeSingleDomainAssessment — calls the EXISTING onboarding-sync writer (reuse, not reimplement)', () => {
  beforeEach(() => {
    syncMock.mockClear();
    syncMock.mockResolvedValue(true);
  });

  it('calls syncOnboardingToFirestore with mode COMPLETED and a single-domain assignedResults payload', async () => {
    const ok = await writeSingleDomainAssessment('legs', 14);
    expect(ok).toBe(true);
    expect(syncMock).toHaveBeenCalledTimes(1);
    const [mode, data] = syncMock.mock.calls[0];
    expect(mode).toBe('COMPLETED');
    expect(data.assignedResults).toHaveLength(1);
    expect(data.assignedResults[0].programId).toBe('legs');
    expect(data.assignedResults[0].masterProgramSubLevels.legs).toBe(14);
    // Disturbs no other domain: every other category explicitly zeroed, not omitted/invented.
    expect(data.assignedResults[0].masterProgramSubLevels.push).toBe(0);
    expect(data.assignedResults[0].masterProgramSubLevels.pull).toBe(0);
    expect(data.assignedResults[0].masterProgramSubLevels.core).toBe(0);
  });

  it('propagates a false/failed sync result rather than swallowing it', async () => {
    syncMock.mockResolvedValueOnce(false);
    const ok = await writeSingleDomainAssessment('push', 3);
    expect(ok).toBe(false);
  });
});
