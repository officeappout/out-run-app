import { describe, expect, it } from 'vitest';
import { whereLocationOptions } from '../where-location-options';

describe('whereLocationOptions (AA4)', () => {
  it('offers park + home when home is available', () => {
    expect(whereLocationOptions({ current: 'park', showService: false, homeBlocked: false })).toEqual(['park', 'home']);
  });
  it('drops home when the workout has no home version: park only, the toggle hides', () => {
    expect(whereLocationOptions({ current: 'park', showService: false, homeBlocked: true })).toEqual(['park']);
  });
  it('keeps service for military users', () => {
    expect(whereLocationOptions({ current: 'park', showService: true, homeBlocked: true })).toEqual(['park', 'service']);
  });
  it('never drops the current location', () => {
    expect(whereLocationOptions({ current: 'home', showService: false, homeBlocked: true })).toEqual(['park', 'home']);
  });
});
