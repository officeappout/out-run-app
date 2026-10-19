import { describe, expect, it } from 'vitest';
import { anchorOnSegment, compassBearing } from '../segment-anchor';
import { buildLoopDirectionsParams, travelBearing } from '../mapbox-params';
import { isArterialSegment, segmentQuality } from '../segment-quality';
import { ringCells, RING_CELL_PRECISION } from '../ring-cells';
import { applyHonestAttributes, applyMeasuredAttributes, trafficLoadFromMetrics } from '../honest-features';
import { nearMajorRoad } from '../near-major-road';
import type { Route } from '../../../types/route.types';
import type { RouteQualityMetrics } from '@/lib/route-quality';

const U = { lat: 32.0779, lng: 34.774 };

describe('segment anchor', () => {
  it('puts the waypoint halfway along the street geometry with the street bearing there', () => {
    // An L-shaped way: 100 m north, then 300 m east → halfway (200 m) is on the east leg.
    const path = [{ lat: 32, lng: 34.8 }, { lat: 32.0009, lng: 34.8 }, { lat: 32.0009, lng: 34.80318 }];
    const a = anchorOnSegment(path)!;
    expect(a.lat).toBeCloseTo(32.0009, 5);
    expect(a.lng).toBeGreaterThan(34.8);
    expect(Math.round(a.bearingDeg)).toBe(90);
    expect(a.lengthM).toBeGreaterThan(390);
    expect(anchorOnSegment([{ lat: 1, lng: 1 }])).toBeNull();
  });
});

describe('Mapbox loop params', () => {
  it('asks for the street direction matching a clockwise sweep, flipping the street if needed', () => {
    const north = { lat: U.lat + 0.008, lng: U.lng }; // azimuth 0 → wants travel east (90)
    expect(travelBearing(U, { ...north, bearingDeg: 270, snapped: true })).toBe(90);
    expect(travelBearing(U, { ...north, bearingDeg: 85, snapped: true })).toBe(85);
    // a radial street (runs north-south) has no good orientation → no bearing
    expect(travelBearing(U, { ...north, bearingDeg: 0, snapped: true })).toBeNull();
    expect(travelBearing(U, { ...north, bearingDeg: 90 })).toBeNull(); // not snapped
  });

  it('builds walkway bias + per-coordinate radiuses/bearings (start/end unrestricted)', () => {
    const p = buildLoopDirectionsParams(U, [
      { lat: U.lat + 0.008, lng: U.lng, bearingDeg: 90, snapped: true },
      { lat: U.lat, lng: U.lng + 0.009, bearingDeg: 0, snapped: true },
      { lat: U.lat - 0.008, lng: U.lng }, // e.g. a fitness anchor — not snapped
    ], 'walking');
    expect(p).toMatchObject({ continue_straight: 'true', alternatives: 'false', walkway_bias: '1' });
    expect(p.radiuses).toBe('unlimited;25;25;unlimited;unlimited');
    expect(p.bearings).toBe(';90,45;180,45;;');
  });

  it('never sends walkway_bias to the cycling profile', () => {
    expect(buildLoopDirectionsParams(U, [], 'cycling').walkway_bias).toBeUndefined();
  });
});

describe('segment quality', () => {
  it('ranks calm, lit, slow streets above tertiary roads', () => {
    expect(segmentQuality({ highway: 'living_street', lit: 'yes', maxspeed: '30' })).toBeGreaterThan(8);
    expect(segmentQuality({ highway: 'residential', sidewalk: 'both' })).toBeGreaterThan(segmentQuality({ highway: 'tertiary' }));
    expect(segmentQuality({ highway: 'tertiary', maxspeed: '60' })).toBeLessThan(3);
    expect(isArterialSegment({ highway: 'primary' })).toBe(true);
    expect(isArterialSegment({ highway: 'tertiary' })).toBe(false);
  });
});

describe('ring cells', () => {
  it('samples a bounded set of small cells on the waypoint ring', () => {
    const cells = ringCells(U, 0.8);
    expect(cells.length).toBeGreaterThan(30);
    expect(cells.length).toBeLessThanOrEqual(64);
    expect(cells.every(c => c.length === RING_CELL_PRECISION)).toBe(true);
  });
});

describe('near major road', () => {
  it('detects a point beside a tertiary+ centerline', () => {
    const osm = { bbox: { south: 0, west: 0, north: 0, east: 0 }, crossings: [], roads: [{ id: 1, highway: 'secondary', coords: [[34.77, 32.07], [34.78, 32.07]] as [number, number][] }] };
    expect(nearMajorRoad(osm, 32.07008, 34.775)).toBe(true); // ~9 m
    expect(nearMajorRoad(osm, 32.0705, 34.775)).toBe(false); // ~55 m
  });
});

describe('honest attributes', () => {
  const base = (): Route => ({ rating: 4.8, features: { hasGym: false, hasBenches: true, lit: true, scenic: true, terrain: 'road', environment: 'urban', trafficLoad: 'low', surface: 'asphalt' } } as unknown as Route);
  it('drops invented values and keeps measured ones', () => {
    const measured = applyMeasuredAttributes(base(), { majorRoadPct: 0.2 } as RouteQualityMetrics);
    const other = base();
    applyHonestAttributes([measured, other]);
    expect(measured.features).toMatchObject({ hasBenches: false, lit: undefined, trafficLoad: 'medium' });
    expect(measured.rating).toBe(0);
    expect(other.features).toMatchObject({ hasBenches: false, lit: undefined, trafficLoad: 'unknown' });
    expect(other.rating).toBe(0);
  });
  it('traffic load follows the measured major-road share', () => {
    expect(trafficLoadFromMetrics(null)).toBe('unknown');
    expect(trafficLoadFromMetrics({ majorRoadPct: 0.05 } as RouteQualityMetrics)).toBe('low');
    expect(trafficLoadFromMetrics({ majorRoadPct: 0.5 } as RouteQualityMetrics)).toBe('high');
  });
});

it('compassBearing sanity', () => {
  expect(Math.round(compassBearing(U, { lat: U.lat + 0.01, lng: U.lng }))).toBe(0);
  expect(Math.round(compassBearing(U, { lat: U.lat, lng: U.lng + 0.01 }))).toBe(90);
});
