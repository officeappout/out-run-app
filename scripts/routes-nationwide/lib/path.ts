/** Route path in either stored shape ([lng,lat] tuples or {lng,lat} objects) → [lng,lat][]. */
export function parsePathLoose(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  const out: [number, number][] = [];
  for (const p of raw) {
    if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) out.push([p[0], p[1]]);
    else if (p && typeof p === 'object' && Number.isFinite((p as any).lng) && Number.isFinite((p as any).lat)) out.push([(p as any).lng, (p as any).lat]);
  }
  return out;
}
