import { describe, expect, it } from 'vitest';
import { DATASETS } from '../registry';
import { normalizeFeatures } from '../normalize';
import { planDatasetImport } from '../plan';
import { treeShadeHint } from '../tree-hint';
import { east, lineFeature, square } from './helpers';
import type { DatasetLine } from '../types';

const spec = DATASETS.bph_infra_exist;
// Field names as in the MoT layer (case varies between releases — read case-insensitively).
const props = (o: Record<string, unknown>) => ({ ID: 1, BPHType: 'שביל (ג)', USABLE: 'שמיש', STREETNAME: 'הרצל', ROADNAME: ' ', BPHPLACE: 'בין המיסעה לרצועת ההליכה', DIV_Walk: 'צמוד להולכי רגל', Trees: 'בשני צדדים', ...o });

describe('bph_infra_exist (MoT national bike-path layer)', () => {
  it('skips crossings, keeps usable sections, ROADNAME when STREETNAME is blank, keeps the attributes', () => {
    const fc = { type: 'FeatureCollection', features: [
      lineFeature(east(34.78, 32.08, 300), props({ ID: 1 })),
      lineFeature(east(34.78, 32.081, 20), props({ ID: 2, BPHType: 'מעבר חציה' })),
      lineFeature(east(34.78, 32.082, 300), props({ ID: 3, USABLE: 'לא שמיש' })),
      lineFeature(east(34.78, 32.083, 300), { id: 4, bphtype: 'נתיב (ב)', usable: 'שמיש', streetname: ' ', roadname: 'כביש 4', trees: 'אין' }),
    ] };
    const { lines, report } = normalizeFeatures(fc, spec);
    expect(report.skippedExcluded).toBe(1);
    expect(report.skippedStatus).toEqual({ 'לא שמיש': 1 });
    expect(lines.map((l) => l.name)).toEqual(['הרצל', 'כביש 4']);
    expect(lines[0].attrs).toMatchObject({ BPHPLACE: 'בין המיסעה לרצועת ההליכה', DIV_Walk: 'צמוד להולכי רגל', Trees: 'בשני צדדים' });
    expect(lines[1].attrs?.Trees).toBe('אין');
  });

  it('stitches same-name sections into ≥2 km corridors with a tree shade hint, authority by boundary majority', () => {
    const pieces = [0, 1, 2, 3, 4].map((k) => lineFeature(east(34.78 + (k * 500) / 94_400, 32.08, 500), props({ ID: 10 + k, Trees: k < 3 ? 'בשני צדדים' : 'בצד אחד' })));
    const plan = planDatasetImport({ type: 'FeatureCollection', features: pieces }, spec, {
      boundaries: [{ id: 'A', name: 'עיר', geometry: square(34.77, 32.07, 5000) }], cityByAuthority: { A: 'עיר' }, existing: [], snapshot: null, importBatchId: 't',
    });
    expect(plan.routes).toHaveLength(1);
    const r = plan.routes[0];
    expect(r.authorityId).toBe('A');
    expect(r.data.name).toBe('שביל אופניים — הרצל');
    expect((r.data as any).provenance.dataset.license).toBe('other-open (data.gov.il)');
    expect(r.shadeHint).toBeCloseTo(0.26, 2);
    expect(plan.lines).toHaveLength(5);
  });
});

describe('treeShadeHint', () => {
  const l = (trees: string | undefined, m = 100): DatasetLine => ({ featureId: String(Math.random()), name: '', status: null, coords: east(34.78, 32.08, m), ...(trees ? { attrs: { Trees: trees } } : {}) });
  it('length-weighted SI-equivalent; null when under half the length answers', () => {
    expect(treeShadeHint([l('בשני צדדים'), l('אין')])).toBeCloseTo(0.175, 3);
    expect(treeShadeHint([l('בצד אחד', 100), l(undefined, 300)])).toBeNull();
    expect(treeShadeHint([l('לא רלוונטי')])).toBeNull();
  });
});
