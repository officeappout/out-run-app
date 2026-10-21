import { describe, expect, it } from 'vitest';
import { routeDataCredits } from '../route-attribution';

describe('routeDataCredits — open-dataset credit', () => {
  it('credits a dataset-imported route, linked to the dataset page', () => {
    const credits = routeDataCredits({ provenance: { dataset: { key: 'ofneidan', license: 'CC-BY-4.0', attribution: 'משרד התחבורה והבטיחות בדרכים — data.gov.il (CC BY)', url: 'https://data.gov.il/dataset/ofneidan' } } });
    expect(credits).toEqual([{ key: 'dataset', text: 'משרד התחבורה והבטיחות בדרכים — data.gov.il (CC BY)', href: 'https://data.gov.il/dataset/ofneidan' }]);
  });
  it('routes without provenance.dataset are unchanged', () => {
    expect(routeDataCredits({ origin: 'osm_import' }).map((c) => c.key)).toEqual(['osm']);
    expect(routeDataCredits({})).toEqual([]);
  });
});
