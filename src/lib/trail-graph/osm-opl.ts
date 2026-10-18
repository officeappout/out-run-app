/**
 * trail-graph/osm-opl.ts — parser for osmium's OPL text format
 * (`osmium cat -f opl,add_metadata=false`). Pure. One object per line:
 *   n<id> T<k=v,…> x<lon> y<lat>
 *   w<id> T<k=v,…> N<n1>,<n2>,…
 *   r<id> T<k=v,…> M<n|w|r><id>@<role>,…
 * Special characters are escaped as %<hex codepoint>%.
 */
import type { OsmData, OsmMember, Tags } from './types';

export function unescapeOpl(s: string): string {
  return s.replace(/%([0-9a-fA-F]+)%/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
}

export function parseOplTags(field: string): Tags {
  const tags: Tags = {};
  if (!field) return tags;
  for (const kv of field.split(',')) {
    if (!kv) continue;
    const eq = kv.indexOf('=');
    if (eq < 0) continue;
    tags[unescapeOpl(kv.slice(0, eq))] = unescapeOpl(kv.slice(eq + 1));
  }
  return tags;
}

export function emptyOsmData(): OsmData {
  return { nodes: new Map(), ways: new Map(), relations: new Map() };
}

/** Parses one OPL line into `data`. Unknown/empty lines are ignored. */
export function parseOplLine(line: string, data: OsmData): void {
  if (!line) return;
  const kind = line[0];
  const fields = line.split(' ');
  const id = Number(fields[0].slice(1));
  let tags: Tags = {};
  let lon = NaN;
  let lat = NaN;
  let nodes: number[] = [];
  let members: OsmMember[] = [];
  for (let i = 1; i < fields.length; i++) {
    const f = fields[i];
    const c = f[0];
    const v = f.slice(1);
    if (c === 'T') tags = parseOplTags(v);
    else if (c === 'x') lon = Number(v);
    else if (c === 'y') lat = Number(v);
    else if (c === 'N') nodes = v ? v.split(',').map((n) => Number(n.slice(1))) : [];
    else if (c === 'M') {
      members = v
        ? v.split(',').map((m) => {
            const at = m.indexOf('@');
            return { type: m[0] as 'n' | 'w' | 'r', ref: Number(m.slice(1, at)), role: unescapeOpl(m.slice(at + 1)) };
          })
        : [];
    }
  }
  if (kind === 'n') {
    if (Number.isFinite(lon) && Number.isFinite(lat)) data.nodes.set(id, { id, lon, lat, tags });
  } else if (kind === 'w') data.ways.set(id, { id, nodes, tags });
  else if (kind === 'r') data.relations.set(id, { id, members, tags });
}

export function parseOpl(text: string): OsmData {
  const data = emptyOsmData();
  for (const line of text.split('\n')) parseOplLine(line, data);
  return data;
}
