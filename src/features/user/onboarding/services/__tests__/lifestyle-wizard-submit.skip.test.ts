import { describe, it, expect, vi } from 'vitest';

const setDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  setDoc: (...a: unknown[]) => setDoc(...a),
  serverTimestamp: () => 'ts',
  Timestamp: { now: () => 'now' },
}));

import { writeLifestyleWizardCompletion } from '../lifestyle-wizard-submit.service';

const write = {} as never;
const written = () => setDoc.mock.calls.at(-1)![1] as Record<string, unknown>;

describe('writeLifestyleWizardCompletion persona skip', () => {
  it('default: writes personas, no marker keys (byte-identical to before)', async () => {
    await writeLifestyleWizardCompletion({} as never, 'u', ['student'], write);
    expect(written().personas).toEqual([{ id: 'student', answers: {}, updatedAt: 'now' }]);
    expect('personaStepSkipped' in written()).toBe(false);
  });
  it('skipped: no personas key at all, marker true', async () => {
    await writeLifestyleWizardCompletion({} as never, 'u', [], write, { omitPersonas: true });
    expect('personas' in written()).toBe(false);
    expect(written().personaStepSkipped).toBe(true);
  });
  it('answered after an earlier skip: marker retired', async () => {
    await writeLifestyleWizardCompletion({} as never, 'u', ['student'], write, { clearSkipMarker: true });
    expect(written().personaStepSkipped).toBe(false);
  });
});
