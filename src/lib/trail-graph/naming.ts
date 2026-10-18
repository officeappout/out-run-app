/**
 * trail-graph/naming.ts — deterministic, rule-based route names. Pure.
 * NO LLM-generated names: every name is either OSM's own, or assembled
 * from real OSM names (colour/ref/toponym/park/settlement) by fixed rules.
 *
 * Order (first rule that yields a name wins):
 *   1. official OSM name:he → name           ("שביל הבשור")
 *   2. marked-trail colour [+ ref] [· toponym] ("שביל אדום 9251 · נחל שקמה")
 *      toponym = the most-traversed named way on the route, else the
 *      nearest named natural feature (valley/peak/spring/stream…) ≤ 1 km
 *   3. urban: "לולאת {park}" for loops in/at a park, "טיילת {name}"
 *   4. endpoints "{A} → {B}" (nearest named places, ≤ 1.5 km, A ≠ B)
 *   5. placeholder "מסלול {יישוב} #n" — needsName: true
 */
import { pointPolylineDistM } from './geo';
import { COLOUR_HE } from './tags';
import type { LngLat, NameSource, Tags } from './types';

export interface NamedFeature {
  name: string;
  kind: string;
  /** Point features: one coordinate; linear (stream) features: the line. */
  geometry: LngLat[];
}

export interface NamingInput {
  relationTags?: Tags;
  colour: string | null;
  ref: string | null;
  shape: 'loop' | 'out_and_back' | 'linear';
  geometry: LngLat[];
  /** Named ways on the route with the length (m) the route uses them for. */
  namedWayLengths: Array<{ name: string; lengthM: number }>;
  builtUpShare: number;
  /** Park the route is mostly inside/along (≥ 50 % within 50 m), if any. */
  parkName: string | null;
  toponyms: NamedFeature[];
  places: NamedFeature[];
  settlement: string | null;
  /** Called only for the placeholder rule; returns the next #n for this settlement. */
  nextPlaceholderIndex: (settlement: string) => number;
}

export interface NamingResult {
  name: string;
  nameSource: NameSource;
  needsName: boolean;
  toponym: string | null;
}

export const TOPONYM_RADIUS_M = 1000;
export const ENDPOINT_RADIUS_M = 1500;

/** OSM name that is really a name, not a bare number/ref. */
export function officialName(tags: Tags | undefined): string | null {
  if (!tags) return null;
  const n = (tags['name:he'] ?? tags.name ?? '').trim();
  if (!n) return null;
  if (/^[\d\s.\-/]+$/.test(n)) return null;
  if (tags.ref && n === tags.ref) return null;
  return n;
}

export function nearestFeature(geometry: LngLat[], features: NamedFeature[], radiusM: number, probe?: LngLat[]): NamedFeature | null {
  let best: NamedFeature | null = null;
  let bestD = radiusM;
  const pts = probe ?? geometry;
  const stride = Math.max(1, Math.floor(pts.length / 60));
  for (const f of features) {
    let d = Infinity;
    if (f.geometry.length === 1) {
      d = pointPolylineDistM(f.geometry[0], geometry);
    } else {
      for (let i = 0; i < pts.length; i += stride) d = Math.min(d, pointPolylineDistM(pts[i], f.geometry));
    }
    if (d <= bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/** Most-traversed named way, ignoring names that are just the route's own ref. */
export function dominantWayName(namedWayLengths: Array<{ name: string; lengthM: number }>, ref?: string | null): string | null {
  const acc = new Map<string, number>();
  for (const { name, lengthM } of namedWayLengths) {
    if (!name || (ref && name === ref)) continue;
    acc.set(name, (acc.get(name) ?? 0) + lengthM);
  }
  let best: string | null = null;
  let bestL = 0;
  for (const [n, L] of Array.from(acc)) if (L > bestL) { best = n; bestL = L; }
  return best;
}

export function toponymFor(input: Pick<NamingInput, 'namedWayLengths' | 'ref' | 'geometry' | 'toponyms'>): string | null {
  const w = dominantWayName(input.namedWayLengths, input.ref);
  if (w) return w;
  return nearestFeature(input.geometry, input.toponyms, TOPONYM_RADIUS_M)?.name ?? null;
}

export function nameRoute(input: NamingInput): NamingResult {
  const off = officialName(input.relationTags);
  if (off) return { name: off, nameSource: 'osm_name', needsName: false, toponym: null };

  const toponym = toponymFor(input);
  const colourHe = input.colour ? COLOUR_HE[input.colour] : undefined;
  if (colourHe && (input.ref || toponym)) {
    const head = `שביל ${colourHe}${input.ref ? ` ${input.ref}` : ''}`;
    return { name: toponym ? `${head} · ${toponym}` : head, nameSource: 'itc_colour_ref_toponym', needsName: false, toponym };
  }

  if (input.builtUpShare >= 0.6) {
    if (input.parkName && input.shape === 'loop') return { name: `לולאת ${input.parkName}`, nameSource: 'urban_park_or_promenade', needsName: false, toponym: input.parkName };
    const prom = dominantWayName(input.namedWayLengths, input.ref);
    if (prom && /טיילת/.test(prom)) {
      const name = prom.startsWith('טיילת') ? prom : `טיילת ${prom}`;
      return { name, nameSource: 'urban_park_or_promenade', needsName: false, toponym: prom };
    }
  }

  if (input.shape !== 'loop' && input.geometry.length >= 2) {
    const a = nearestFeature([input.geometry[0]], input.places, ENDPOINT_RADIUS_M);
    const b = nearestFeature([input.geometry[input.geometry.length - 1]], input.places, ENDPOINT_RADIUS_M);
    if (a && b && a.name !== b.name) return { name: `${a.name} → ${b.name}`, nameSource: 'endpoints', needsName: false, toponym: null };
  }

  const s = input.settlement ?? 'שער הנגב';
  return { name: `מסלול ${s} #${input.nextPlaceholderIndex(s)}`, nameSource: 'placeholder', needsName: true, toponym };
}

/** Nearest named place to each end of a line (≤ ENDPOINT_RADIUS_M), for "A → B" labels. */
export function endpointNames(geometry: LngLat[], places: NamedFeature[]): { from: string | null; to: string | null } {
  if (geometry.length < 2) return { from: null, to: null };
  return {
    from: nearestFeature([geometry[0]], places, ENDPOINT_RADIUS_M)?.name ?? null,
    to: nearestFeature([geometry[geometry.length - 1]], places, ENDPOINT_RADIUS_M)?.name ?? null,
  };
}

/** Honest descriptive name for a graph-generated route. */
export function generatedRouteName(args: { settlement: string; shape: 'loop' | 'out_and_back'; lengthM: number; via: string | null }): string {
  const km = (args.lengthM / 1000).toFixed(1);
  const head = args.shape === 'loop' ? `לולאת ${args.settlement}` : `הלוך-חזור מ${args.settlement}`;
  return args.via ? `${head} · ${args.via} · ${km} ק״מ` : `${head} · ${km} ק״מ`;
}

// ── Duplicate-name disambiguation ─────────────────────────────────────────
// Two different OSM relations can earn the same rule-built name (pilot:
// two unref'd red trails both nearest "חורבת ג'ממה"). Rule, applied ONLY
// to names shared by ≥2 routes, members processed in id order:
//   a. the ITC/KKL `ref`, when this member has one, it's not already in the
//      name and no other member of the group has the same ref → "… · 9251"
//   b. the next distinct toponym: nearest named feature (≤ 3 km) whose name
//      is not already in the name, not taken by an earlier member, and is
//      closer to THIS route than to any other member (so it actually tells
//      them apart) → "… · נחל X"; if none is distinctive, the nearest unused
//   c. last resort, an ordinal "… (2)" — deterministic, never a guess.
// Non-duplicated names are returned untouched.

export const DISAMBIGUATE_RADIUS_M = 3000;

export interface DisambiguationItem {
  id: string;
  name: string;
  ref: string | null;
  geometry: LngLat[];
}

function featureDistM(f: NamedFeature, line: LngLat[]): number {
  if (f.geometry.length === 1) return pointPolylineDistM(f.geometry[0], line);
  const stride = Math.max(1, Math.floor(line.length / 60));
  let d = Infinity;
  for (let i = 0; i < line.length; i += stride) d = Math.min(d, pointPolylineDistM(line[i], f.geometry));
  return d;
}

/** Returns id → disambiguated name, only for ids whose name changed. */
export function disambiguateDuplicateNames(items: DisambiguationItem[], features: NamedFeature[], radiusM = DISAMBIGUATE_RADIUS_M): Map<string, string> {
  const out = new Map<string, string>();
  const groups = new Map<string, DisambiguationItem[]>();
  for (const it of items) {
    const g = groups.get(it.name) ?? [];
    g.push(it);
    groups.set(it.name, g);
  }
  const taken = new Set(items.map((i) => i.name));
  for (const [name, group] of Array.from(groups)) {
    if (group.length < 2) continue;
    const members = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const used = new Set<string>();
    const refCount = new Map<string, number>();
    for (const m of members) if (m.ref) refCount.set(m.ref, (refCount.get(m.ref) ?? 0) + 1);
    members.forEach((m, idx) => {
      let suffix: string | null = null;
      if (m.ref && !name.includes(m.ref) && refCount.get(m.ref) === 1) suffix = m.ref;
      if (!suffix) {
        const others = members.filter((o) => o !== m);
        const ranked = features
          .filter((f) => f.name && !name.includes(f.name) && !used.has(f.name))
          .map((f) => ({ f, d: featureDistM(f, m.geometry) }))
          .filter((x) => x.d <= radiusM)
          .sort((a, b) => a.d - b.d || a.f.name.localeCompare(b.f.name, 'he'));
        const distinctive = ranked.find((x) => others.every((o) => featureDistM(x.f, o.geometry) > x.d));
        suffix = (distinctive ?? ranked[0])?.f.name ?? null;
      }
      let next = suffix ? `${name} · ${suffix}` : `${name} (${idx + 1})`;
      if (taken.has(next)) next = `${next} (${idx + 1})`;
      if (suffix) used.add(suffix);
      taken.add(next);
      out.set(m.id, next);
    });
  }
  return out;
}
