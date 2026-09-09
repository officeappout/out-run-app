import { describe, it, expect } from 'vitest';
import { expectedUploadCategoryFor } from '../expectedUploadCategoryFor';

describe('expectedUploadCategoryFor', () => {
  it('communities/{uid}/... -> image', () => {
    expect(expectedUploadCategoryFor('communities/u1/1234-photo.jpg')).toBe('image');
  });
  it('contribution-photos/{uid}/... -> image', () => {
    expect(expectedUploadCategoryFor('contribution-photos/u1/1234_park.png')).toBe('image');
  });
  it('health-declarations/{uid}/... -> pdf', () => {
    expect(expectedUploadCategoryFor('health-declarations/u1/signed.pdf')).toBe('pdf');
  });
  it('an admin-only path (e.g. admin-avatars) -> null, out of this check\'s scope', () => {
    expect(expectedUploadCategoryFor('admin-avatars/admin1.jpg')).toBe(null);
  });
  it('an unrelated/unknown path -> null', () => {
    expect(expectedUploadCategoryFor('parks/somefile.jpg')).toBe(null);
  });
});
