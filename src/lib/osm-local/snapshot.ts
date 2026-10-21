/**
 * Region OSM snapshot — the compact, pre-extracted per-region OSM data the
 * geo-discovery Cloud Function reads from Storage instead of Overpass (RC6
 * step 4). Produced offline from the Geofabrik PBF by
 * scripts/routes-nationwide/build-osm-region-snapshot.ts, so the function
 * needs neither osmium nor the 120 MB PBF.
 *
 * Storage: gs://<project>.firebasestorage.app/osm/regions/v1/<regionKey>.json.gz
 * Format v1 (JSON): nodes are only those referenced by kept ways/relations
 * (no node tags — no geo-discovery query selects nodes), coordinates rounded
 * to 7 decimals (~1 cm). Pure: no I/O.
 */
import type { OsmData, OsmMember, Tags } from '../trail-graph/types';

export const OSM_SNAPSHOT_VERSION = 1;
export const OSM_SNAPSHOT_PREFIX = 'osm/regions/v1';
export const osmSnapshotPath = (regionKey: string) => `${OSM_SNAPSHOT_PREFIX}/${regionKey}.json.gz`;

export interface OsmSnapshotMeta {
  regionKey: string;
  bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number };
  /** PBF replication timestamp — the OSM data date we cite. */
  osmTimestamp: string | null;
  extract: 'geofabrik:israel-and-palestine';
  license: 'ODbL-1.0';
  attribution: '© OpenStreetMap contributors';
  builtAt: string;
}

export interface OsmSnapshot {
  v: typeof OSM_SNAPSHOT_VERSION;
  meta: OsmSnapshotMeta;
  /** [id, lon, lat] */
  n: Array<[number, number, number]>;
  /** [id, tags, nodeIds] */
  w: Array<[number, Tags, number[]]>;
  /** [id, tags, [type, ref, role][]] */
  r: Array<[number, Tags, Array<[OsmMember['type'], number, string]>]>;
}

const r7 = (x: number) => Math.round(x * 1e7) / 1e7;

export function toOsmSnapshot(data: OsmData, meta: OsmSnapshotMeta): OsmSnapshot {
  const used = new Set<number>();
  const w: OsmSnapshot['w'] = [];
  for (const way of Array.from(data.ways.values())) {
    w.push([way.id, way.tags, way.nodes]);
    for (const id of way.nodes) used.add(id);
  }
  const r: OsmSnapshot['r'] = [];
  for (const rel of Array.from(data.relations.values())) {
    r.push([rel.id, rel.tags, rel.members.map((m) => [m.type, m.ref, m.role] as [OsmMember['type'], number, string])]);
    for (const m of rel.members) if (m.type === 'n') used.add(m.ref);
  }
  const n: OsmSnapshot['n'] = [];
  for (const id of Array.from(used)) {
    const node = data.nodes.get(id);
    if (node) n.push([id, r7(node.lon), r7(node.lat)]);
  }
  return { v: OSM_SNAPSHOT_VERSION, meta, n, w, r };
}

/** Throws on an unknown version or a malformed body — never a silently empty dataset. */
export function fromOsmSnapshot(raw: unknown): { data: OsmData; meta: OsmSnapshotMeta } {
  const s = raw as OsmSnapshot;
  if (!s || s.v !== OSM_SNAPSHOT_VERSION || !Array.isArray(s.n) || !Array.isArray(s.w) || !Array.isArray(s.r) || !s.meta) {
    throw new Error(`OSM snapshot: unsupported or malformed (v=${(s as { v?: unknown })?.v})`);
  }
  const data: OsmData = { nodes: new Map(), ways: new Map(), relations: new Map() };
  for (const [id, lon, lat] of s.n) data.nodes.set(id, { id, lon, lat, tags: {} });
  for (const [id, tags, nodes] of s.w) data.ways.set(id, { id, tags: tags ?? {}, nodes });
  for (const [id, tags, members] of s.r) data.relations.set(id, { id, tags: tags ?? {}, members: members.map(([type, ref, role]) => ({ type, ref, role })) });
  return { data, meta: s.meta };
}
