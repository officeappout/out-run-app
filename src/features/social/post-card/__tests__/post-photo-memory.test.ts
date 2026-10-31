import { describe, it, expect } from 'vitest';
import { localDay, pickPostPhoto, type PostPhotoMemo } from '../post-photo-memory';

describe('pickPostPhoto (board PostPhotoCompact)', () => {
  const list: PostPhotoMemo[] = [
    { url: 'https://x/run2.jpg', category: 'cardio', day: '2026-10-31', atMs: 3 },
    { url: 'https://x/str.jpg', category: 'strength', day: '2026-10-31', atMs: 2 },
    { url: 'https://x/run1.jpg', category: 'cardio', day: '2026-10-31', atMs: 1 },
    { url: 'https://x/old.jpg', category: 'strength', day: '2026-10-30', atMs: 0 },
  ];
  it('the latest photo of the same day and category', () => {
    expect(pickPostPhoto(list, 'cardio', '2026-10-31')).toBe('https://x/run2.jpg');
    expect(pickPostPhoto(list, 'strength', '2026-10-31')).toBe('https://x/str.jpg');
  });
  it('none from another day or category', () => {
    expect(pickPostPhoto(list, 'maintenance', '2026-10-31')).toBeNull();
    expect(pickPostPhoto(list, 'strength', '2026-11-01')).toBeNull();
  });
  it('localDay is the local calendar day', () => {
    expect(localDay(new Date(2026, 9, 31, 23, 50))).toBe('2026-10-31');
  });
});
