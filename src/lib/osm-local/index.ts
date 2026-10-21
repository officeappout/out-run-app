/** osm-local — geo-discovery's OSM answered locally (Geofabrik PBF / region snapshot) instead of Overpass. Pure. */
export { createLocalOsmStore, assembleRings, inRings, inBbox, lineTouchesBbox, type LocalOsmStore, type LatLon, type Bbox } from './store';
export { runLocalOverpass, UnsupportedOverpassQuery } from './overpass-local';
export { toOsmSnapshot, fromOsmSnapshot, osmSnapshotPath, OSM_SNAPSHOT_PREFIX, OSM_SNAPSHOT_VERSION, type OsmSnapshot, type OsmSnapshotMeta } from './snapshot';
