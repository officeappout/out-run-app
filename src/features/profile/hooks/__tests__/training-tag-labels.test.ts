import { beforeAll, describe, expect, it } from 'vitest';
import { ensureCatalog } from '@/lib/i18n/catalogs';
import { makeT } from '@/lib/i18n/t';
import { profile } from '@/messages/ns/profile';
import { TRAINING_TAG_OPTIONS } from '../usePersonalInfoEditor';
import { trainingTagLabel } from '../training-tag-label';

describe('training tag chip labels (AH1)', () => {
  beforeAll(async () => {
    await ensureCatalog('en', 'profile');
  });
  it('Hebrew catalog text equals the old hard-coded label for every tag', () => {
    const t = makeT('he', profile);
    for (const tag of TRAINING_TAG_OPTIONS) expect(t('editProfile.tags.option', { id: tag.id })).toBe(tag.label);
  });
  it('English has a label for every tag and never falls back to the raw id', () => {
    const t = makeT('en', profile);
    for (const tag of TRAINING_TAG_OPTIONS) {
      const label = t('editProfile.tags.option', { id: tag.id });
      expect(label).not.toBe(tag.id);
      expect(label).not.toMatch(/[֐-׿]/);
    }
  });
  it('an id outside the catalog keeps its own label in every locale', () => {
    expect(trainingTagLabel({ id: 'street', label: 'סטריט' }, makeT('he', profile))).toBe('סטריט');
    expect(trainingTagLabel({ id: 'street', label: 'סטריט' }, makeT('en', profile))).toBe('סטריט');
    expect(trainingTagLabel({ id: 'running', label: 'ריצה' }, makeT('en', profile))).toBe('Running');
  });
});
