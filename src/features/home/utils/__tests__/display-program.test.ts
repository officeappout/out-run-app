import { describe, expect, it } from 'vitest';
import { displayProgramTemplateId } from '../display-program';

const MASTERS = { full_body: ['push', 'pull', 'legs'] } as const;
const ap = (...ids: string[]) => ids.map((templateId) => ({ templateId }));

describe('displayProgramTemplateId (AH18)', () => {
  it('every child of full_body, no parent → full_body', () => {
    expect(displayProgramTemplateId(ap('push', 'pull', 'legs', 'core'), MASTERS)).toBe('full_body');
  });
  it('a single child program stays itself; the parent saved stays first', () => {
    expect(displayProgramTemplateId(ap('push'), MASTERS)).toBe('push');
    expect(displayProgramTemplateId(ap('pull', 'push'), MASTERS)).toBe('pull');
    expect(displayProgramTemplateId(ap('full_body', 'push', 'pull', 'legs'), MASTERS)).toBe('full_body');
  });
  it('nothing → undefined', () => {
    expect(displayProgramTemplateId([], MASTERS)).toBeUndefined();
    expect(displayProgramTemplateId(null, MASTERS)).toBeUndefined();
  });
});
