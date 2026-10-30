/**
 * Display form of a GENERATED route name. Generated names are saved in Hebrew
 * ("לאורך שדרות רוטשילד · הלוך-חזור", "לולאת X · 5.2 ק״מ", bike-adjacent.ts / trail-graph naming.ts); street and
 * place names inside them stay as saved (proper nouns), only the generated words around them follow the UI language.
 * Hebrew UI: the saved name is returned untouched. Curated (admin-typed) names match no pattern and pass through.
 * Never persist the result.
 */
import { SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales';
import { withUnit } from '@/lib/i18n/units';
import { makeT } from '@/lib/i18n/t';
import { common } from '@/messages/ns/common';
import { map } from '@/messages/ns/map';
import { getCatalog } from '@/lib/i18n/catalogs';

type MapT = (key: 'routeName.along' | 'routeName.outAndBack' | 'routeName.loopOf' | 'routeName.outAndBackFrom', v?: Record<string, string>) => string;

const SEP = ' · ';
const OUT_AND_BACK = 'הלוך-חזור'; // i18n-allow-hebrew: data — the saved generated words this parser matches
const ALONG = 'לאורך '; // i18n-allow-hebrew: data
const LOOP = 'לולאת '; // i18n-allow-hebrew: data
const OUT_AND_BACK_FROM = 'הלוך-חזור מ'; // i18n-allow-hebrew: data
const KM = /^(\d+(?:\.\d+)?) ק״מ$/; // i18n-allow-hebrew: data

export function localizeRouteName(name: string, locale: string): string {
  if (!name || locale === SOURCE_LOCALE) return name;
  if (!getCatalog(locale, map.name)) return name; // catalog not loaded yet: the saved (Hebrew) name, never a key
  const t = makeT(locale as Locale, map) as unknown as MapT;
  const tc = makeT(locale as Locale, common);
  let changed = false;
  const parts = name.split(SEP).map((seg) => {
    let out: string | null = null;
    if (seg === OUT_AND_BACK) out = t('routeName.outAndBack');
    else if (seg.startsWith(OUT_AND_BACK_FROM)) out = t('routeName.outAndBackFrom', { settlement: seg.slice(OUT_AND_BACK_FROM.length) });
    else if (seg.startsWith(ALONG)) out = t('routeName.along', { base: seg.slice(ALONG.length) });
    else if (seg.startsWith(LOOP)) out = t('routeName.loopOf', { settlement: seg.slice(LOOP.length) });
    else {
      const m = KM.exec(seg);
      if (m) out = withUnit('km', m[1], tc);
    }
    if (out == null) return seg;
    changed = true;
    return out;
  });
  return changed ? parts.join(SEP) : name;
}
