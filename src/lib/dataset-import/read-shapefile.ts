/**
 * Zipped shapefile (local buffer) → GeoJSON via shpjs, which also applies the
 * .prj reprojection. No network: the caller reads the file from disk. The
 * downloaded zip is untrusted DATA — it is parsed, never executed.
 */
export async function readShapefileZip(buf: ArrayBuffer | Uint8Array): Promise<unknown> {
  const mod: any = await import('shpjs');
  const shp = mod.default ?? mod;
  const ab = buf instanceof Uint8Array ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf;
  return shp(ab);
}

/** ArcGIS REST layer → GeoJSON query URL (paged). For later municipal layers; not used by the CC-BY pilot. */
export function arcgisQueryUrl(layerUrl: string, offset = 0, pageSize = 2000): string {
  const u = new URL(`${layerUrl.replace(/\/$/, '')}/query`);
  u.searchParams.set('where', '1=1');
  u.searchParams.set('outFields', '*');
  u.searchParams.set('outSR', '4326');
  u.searchParams.set('f', 'geojson');
  u.searchParams.set('resultOffset', String(offset));
  u.searchParams.set('resultRecordCount', String(pageSize));
  return u.toString();
}
