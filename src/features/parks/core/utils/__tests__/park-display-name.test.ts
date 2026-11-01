import { describe, expect, it } from 'vitest';
import { parkDisplayName } from '../park-display-name';

describe('parkDisplayName', () => {
  it('Hebrew always shows the Hebrew name', () => {
    expect(parkDisplayName({ name: 'גינת כושר', nameEn: 'Fitness Park' }, 'he')).toBe('גינת כושר');
  });
  it('English shows nameEn when present, else the Hebrew', () => {
    expect(parkDisplayName({ name: 'גינת כושר', nameEn: 'Fitness Park' }, 'en')).toBe('Fitness Park');
    expect(parkDisplayName({ name: 'גינת כושר', nameEn: '  ' }, 'en')).toBe('גינת כושר');
    expect(parkDisplayName({ name: 'גינת כושר' }, 'en')).toBe('גינת כושר');
    expect(parkDisplayName(null, 'en')).toBe('');
  });
});
