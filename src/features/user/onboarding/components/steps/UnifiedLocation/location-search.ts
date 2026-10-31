/**
 * City / neighbourhood search over the static location list (pure, no React).
 *
 * The list has Hebrew names only. AH4 (owner, English mode): a Latin query found nothing. Every entry's
 * `id` is a transliterated slug (`tel-aviv`, `jr-pisgat-zeev`, later ones a consonant skeleton such as
 * `kryyt-bylyk`), so a Latin query also matches the entry's own slug and its parent's slug, first as
 * written, then by consonant skeleton (vowels and the vowel letters y / v / w dropped, kh / ch -> h). The
 * entry's English display name (israel-locations-en.ts) is matched the same way.
 * A query with no Latin letter is matched exactly as before (Hebrew byte-identical).
 */
import type { CityData } from './location-types';
import { locationNameEnById } from '@/lib/data/location-name-en';

const LATIN = /[a-z]/i;

/** The old Hebrew haystack, unchanged. */
function hebrewHaystack(city: CityData): string {
  return `${city.name} ${city.displayName} ${city.parentName || ''}`.toLowerCase();
}

function slugWords(id: string | undefined): string {
  return (id ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Lower case, apostrophes dropped ("be'er" -> "beer"), any other separator -> space. */
export function normalizeLatin(text: string): string {
  return text
    .toLowerCase()
    .replace(/['\u2019`"\u05f3\u05f4]/g, '')
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, ' ')
    .trim();
}

/** Consonant skeleton of one Latin word: "kiryat" -> "krt", "kryyt" -> "krt", "hagalil" -> "hgll". */
export function latinSkeleton(word: string): string {
  return word
    .toLowerCase()
    .replace(/kh|ch/g, 'h')
    .replace(/ts/g, 'tz')
    .replace(/ck|q|c/g, 'k')
    .replace(/[aeiouyvw]/g, '')
    .replace(/(.)\1+/g, '$1');
}

function latinHaystack(city: CityData): { text: string; compact: string; skeleton: string } {
  // English display names (israel-locations-en.ts) first: real spellings beat the vowel-less slugs.
  const en = `${normalizeLatin(locationNameEnById(city.id) ?? '')} ${normalizeLatin(locationNameEnById(city.parentId) ?? '')}`;
  const text = `${en} ${slugWords(city.id)} ${slugWords(city.parentId)} ${normalizeLatin(city.name)} ${normalizeLatin(city.parentName ?? '')}`;
  return {
    text,
    compact: text.replace(/\s+/g, ''),
    skeleton: text.split(/\s+/).map(latinSkeleton).join(' '),
  };
}

/** Entries matching every query word; same order as `cities`. Caller applies its own cap. */
export function filterLocations(cities: readonly CityData[], query: string): CityData[] {
  const raw = (query ?? '').toLowerCase().trim();
  if (!raw) return [...cities];

  if (!LATIN.test(raw)) {
    const queryWords = raw.split(/\s+/).filter((word) => word.length > 0);
    return cities.filter((city) => queryWords.every((word) => hebrewHaystack(city).includes(word)));
  }

  const words = normalizeLatin(raw).split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const direct = cities.filter((city) => {
    const h = latinHaystack(city);
    return words.every((w) => h.text.includes(w) || h.compact.includes(w));
  });
  if (direct.length > 0) return direct;

  // Skeleton fallback only when nothing matched as written. Very short skeletons ("ra" -> "r") would
  // match nearly everything, so each word needs at least 2 consonants.
  const skeletons = words.map(latinSkeleton);
  if (skeletons.some((s) => s.length < 2)) return [];
  return cities.filter((city) => {
    const h = latinHaystack(city);
    const compactSkeleton = h.skeleton.replace(/\s+/g, '');
    return skeletons.every((s) => h.skeleton.includes(s) || compactSkeleton.includes(s));
  });
}
