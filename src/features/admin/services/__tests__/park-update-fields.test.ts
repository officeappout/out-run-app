import { describe, it, expect } from 'vitest';
import { buildParkUpdateFields } from '../park-update-fields';

// Regression coverage for two bugs found in the parks/admin-panel image-pipeline
// investigation (docs/research/park-admin-workout-flow-investigation.md, item A1):
//   1. `updatePark`'s field whitelist never handled `images` (plural) at all, so
//      every edit-save silently dropped the multi-image array from Firestore
//      regardless of what the caller sent.
//   2. `imageUrl` (the field the Bunny-migration pipeline writes to) wasn't in
//      the whitelist either, so a future/other writer sending it would also be
//      silently dropped.
// `buildParkUpdateFields` is the pure whitelist-building logic extracted out of
// `updatePark` specifically so it's testable without mocking Firestore.

describe('buildParkUpdateFields', () => {
  it('includes the images array when present (previously silently dropped)', () => {
    const result = buildParkUpdateFields({ images: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'] });
    expect(result.images).toEqual(['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg']);
  });

  it('writes null for images when explicitly cleared, never drops the key', () => {
    const result = buildParkUpdateFields({ images: null as unknown as string[] });
    expect('images' in result).toBe(true);
    expect(result.images).toBeNull();
  });

  it('omits images entirely when the caller never touched the field', () => {
    const result = buildParkUpdateFields({ name: 'Park A' });
    expect('images' in result).toBe(false);
  });

  it('coerces a non-array images value to null defensively', () => {
    const result = buildParkUpdateFields({ images: 'not-an-array' as unknown as string[] });
    expect(result.images).toBeNull();
  });

  it('includes imageUrl when present', () => {
    const result = buildParkUpdateFields({ imageUrl: 'https://b-cdn.net/parks/123.jpg' });
    expect(result.imageUrl).toBe('https://b-cdn.net/parks/123.jpg');
  });

  it('omits imageUrl entirely when the caller never touched the field', () => {
    const result = buildParkUpdateFields({ name: 'Park A' });
    expect('imageUrl' in result).toBe(false);
  });

  it('still handles the pre-existing single image field unchanged', () => {
    const result = buildParkUpdateFields({ image: 'https://storage.example/legacy.jpg' });
    expect(result.image).toBe('https://storage.example/legacy.jpg');
  });

  it('does not touch image/images/imageUrl when the caller sends none of them (no regression on unrelated saves)', () => {
    const result = buildParkUpdateFields({ name: 'Renamed Park', description: 'Updated description' });
    expect('image' in result).toBe(false);
    expect('images' in result).toBe(false);
    expect('imageUrl' in result).toBe(false);
    expect(result).toEqual({ name: 'Renamed Park', description: 'Updated description' });
  });

  it('still whitelists the other existing fields unchanged (name, gymEquipment, status)', () => {
    const result = buildParkUpdateFields({
      name: 'Park A',
      gymEquipment: [{ equipmentId: 'eq1', brandName: 'Urbanics' }],
      status: 'open',
    });
    expect(result.name).toBe('Park A');
    expect(result.gymEquipment).toEqual([{ equipmentId: 'eq1', brandName: 'Urbanics' }]);
    expect(result.status).toBe('open');
  });
});
