/**
 * city-inventory/run.ts — one authority's inventory, end to end, from
 * already-loaded inputs (plan §4.1 steps 3-6: clip ⇒ classify ⇒ coverage ⇒
 * readiness). Pure: the I1 script does the I/O (PBF, prod reads) and passes
 * everything in; nothing here reads or writes a backend.
 */
import type { ShadeSpatialIndex } from '@/lib/shade/match';
import { assembleLayers, type PointLayerKey } from './assemble';
import type { BoundaryIndex } from './boundary';
import type { CityInventoryInput } from './doc';
import { measureOsm, type InventoryFeatures } from './measure';
import { peerMedians, type PeerRow } from './peers';
import { computeReadiness } from './readiness';
import { measureShadeCoverage } from './shade-coverage';
import { TECHNION_SHADE_SOURCE_KEY, type ShadeSourceChoice } from './shade-source';
import { POINT_LAYER_KEYS, type AuthorityType } from './types';

export interface RunAuthority {
  id: string;
  name: string;
  type: AuthorityType;
  population: number | null;
}

export interface RunShade {
  index: ShadeSpatialIndex;
  choice: ShadeSourceChoice;
  snapshotDate: string;
  segmentCount: number;
}

export interface BuildInventoryInput {
  authority: RunAuthority;
  boundary: BoundaryIndex;
  features: InventoryFeatures;
  /** ISO date (YYYY-MM-DD) of the PBF snapshot. */
  osmSnapshotDate: string;
  approvedRoutes: number;
  shade: RunShade | null;
  peers: readonly PeerRow[];
  licensePendingKeys: ReadonlySet<string>;
  now: Date;
  runId: string;
  builtBy: string;
}

/** Numbers that are not on the stored doc but explain it in the report. */
export interface InventoryExtras {
  streetKm: number;
  walkableKm: number;
  densities: Record<PointLayerKey, number | null>;
  peerMedians: Record<PointLayerKey, number | null>;
  peerIds: string[];
  shade: { meanSI: number | null; shadedPctOfMatched: number | null } | null;
}

export interface BuildInventoryResult {
  inventory: CityInventoryInput;
  extras: InventoryExtras;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildCityInventory(input: BuildInventoryInput): BuildInventoryResult {
  const tallies = measureOsm(input.features, input.boundary);
  // A city with zero walkable length is a failed extract, not an empty city
  // (axioms §25, "the 0 that isn't 0") — stop rather than report zeros.
  if (tallies.lighting.walkableM <= 0) {
    throw new Error(`city_inventory: no walkable ways inside the boundary of ${input.authority.name} — the OSM extract is empty or the boundary is wrong`);
  }
  const peers = peerMedians(input.authority.id, input.authority.type, input.peers);
  const shadeCov = input.shade ? measureShadeCoverage(tallies.walkableLines, input.shade.index) : null;
  const layers = assembleLayers(tallies, {
    osmSnapshotDate: input.osmSnapshotDate,
    now: input.now,
    peerMedians: peers.medians,
    licensePendingKeys: input.licensePendingKeys,
    shade: input.shade && shadeCov
      ? { coverage: shadeCov, choice: input.shade.choice, snapshotDate: input.shade.snapshotDate, segmentCount: input.shade.segmentCount }
      : null,
  });
  const readiness = computeReadiness({
    hasBoundary: true,
    osmSnapshotDate: input.osmSnapshotDate,
    approvedRoutes: input.approvedRoutes,
    authorityType: input.authority.type,
    population: input.authority.population,
    layers,
  });
  const densities = {} as Record<PointLayerKey, number | null>;
  for (const k of POINT_LAYER_KEYS) densities[k] = layers[k].density;
  return {
    inventory: {
      authorityId: input.authority.id,
      city: input.authority.name,
      authorityType: input.authority.type,
      areaKm2: input.boundary.areaKm2,
      snapshot: { osmPbfDate: input.osmSnapshotDate, builtAt: input.now, builtBy: input.builtBy, runId: input.runId },
      layers,
      readiness,
    },
    extras: {
      streetKm: r1(tallies.streetM / 1000),
      walkableKm: r1(tallies.lighting.walkableM / 1000),
      densities,
      peerMedians: peers.medians,
      peerIds: peers.peerIds,
      shade: shadeCov
        ? { meanSI: shadeCov.meanSI, shadedPctOfMatched: shadeCov.matchedM > 0 ? r1((shadeCov.shadedM / shadeCov.matchedM) * 100) : null }
        : null,
    },
  };
}

/**
 * Source keys whose licence still waits for written approval. Technion: the
 * permission is verbal (TECHNION_PERMISSION), so its layers carry
 * `license_pending` until the written confirmation lands.
 */
export function licensePendingKeys(technionPermission: string): Set<string> {
  return /pending/i.test(technionPermission) ? new Set([TECHNION_SHADE_SOURCE_KEY]) : new Set();
}
