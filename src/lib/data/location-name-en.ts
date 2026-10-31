/**
 * English names for the static location list (israel-locations.ts), display only.
 *
 * The list stores Hebrew names, and those names are also data: geocoding queries, authority lookups and the
 * city saved on the profile all use them. So the Hebrew stays everywhere; English mode swaps the name only
 * where it is rendered, through these helpers. A name with no English entry is shown as is (Hebrew).
 */
import { ISRAELI_LOCATIONS } from './israel-locations';
import { LOCATION_NAME_EN } from './israel-locations-en';

/** English name of a location id, or undefined. */
export function locationNameEnById(id: string | null | undefined): string | undefined {
  return id ? LOCATION_NAME_EN[id] : undefined;
}

interface HeIndex {
  /** "<parent Hebrew>|<Hebrew>" -> English (neighbourhoods / settlements under a city or council). */
  byPair: Map<string, string>;
  /** Top-level Hebrew name -> English. */
  top: Map<string, string>;
  /** Sub-location Hebrew name -> English, only when that Hebrew name maps to one English name everywhere. */
  subUnique: Map<string, string>;
}

let index: HeIndex | null = null;

function heIndex(): HeIndex {
  if (index) return index;
  const byPair = new Map<string, string>();
  const top = new Map<string, string>();
  const subAll = new Map<string, Set<string>>();
  for (const loc of ISRAELI_LOCATIONS) {
    const en = LOCATION_NAME_EN[loc.id];
    if (en && !top.has(loc.name)) top.set(loc.name, en);
    for (const sub of loc.subLocations ?? []) {
      const subEn = LOCATION_NAME_EN[sub.id];
      if (!subEn) continue;
      byPair.set(`${loc.name}|${sub.name}`, subEn);
      if (!subAll.has(sub.name)) subAll.set(sub.name, new Set());
      subAll.get(sub.name)!.add(subEn);
    }
  }
  const subUnique = new Map<string, string>();
  subAll.forEach((set, he) => {
    if (set.size === 1) set.forEach((en) => subUnique.set(he, en));
  });
  index = { byPair, top, subUnique };
  return index;
}

/** English for a Hebrew place name (city, council, neighbourhood); `parentHe` disambiguates neighbourhoods. */
export function locationNameEnByHe(he: string | null | undefined, parentHe?: string | null): string | undefined {
  const name = he?.trim();
  if (!name) return undefined;
  const idx = heIndex();
  if (parentHe) {
    const pair = idx.byPair.get(`${parentHe.trim()}|${name}`);
    if (pair) return pair;
  }
  return idx.top.get(name) ?? idx.subUnique.get(name);
}

/**
 * The place name to SHOW. 'he' (and any other language): the Hebrew as given. 'en': the English name when the
 * list has one, else the Hebrew. Also handles the list's own "<city> - <neighbourhood>" display form.
 */
export function displayLocationName(he: string | null | undefined, lang: string, parentHe?: string | null): string {
  const name = he ?? '';
  if (lang !== 'en' || !name) return name;
  const direct = locationNameEnByHe(name, parentHe);
  if (direct) return direct;
  const parts = name.split(' - ');
  if (parts.length === 2) {
    const city = locationNameEnByHe(parts[0]);
    const sub = locationNameEnByHe(parts[1], parts[0]);
    if (city || sub) return `${city ?? parts[0]} - ${sub ?? parts[1]}`;
  }
  return name;
}
