// @vitest-environment node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { isPropHost, scanLtrHosts } from '../../../../scripts/i18n/wave4-ltr-hosts';

const dirs: string[] = [];
function fixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltrhosts-'));
  dirs.push(root);
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), body);
  }
  return root;
}
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true }); });
const insideNames = (root: string) => Array.from(scanLtrHosts(root).inside.keys()).map((k) => path.basename(k)).sort();

describe('wave4 LTR-host scan', () => {
  it('direct host: components inside the dir="ltr" element are listed, siblings outside are not', () => {
    const root = fixture({
      'Host.tsx': `import Inner from './Inner'; import Outside from './Outside';
export default function Host() { return <div><div dir="ltr"><Inner /></div><Outside /></div>; }`,
      'Inner.tsx': 'export default function Inner() { return <p dir="rtl">x</p>; }',
      'Outside.tsx': 'export default function Outside() { return <p>y</p>; }',
    });
    expect(insideNames(root)).toEqual(['Inner.tsx']);
  });

  it("prop host (direction:'ltr' track rendering children): the CALLERS' rendered components, transitively, are listed", () => {
    const root = fixture({
      'Carousel.tsx': `export function Carousel({ children }) { return <div style={{ direction: 'ltr' }}>{children}</div>; }`,
      'Strip.tsx': `import { Carousel } from './Carousel'; import Slide from './Slide';
export default function Strip() { return <Carousel><Slide /></Carousel>; }`,
      'Slide.tsx': `import Card from './Card'; export default function Slide() { return <Card />; }`,
      'Card.tsx': 'export default function Card() { return <div dir="rtl" />; }',
      'Unrelated.tsx': 'export default function Unrelated() { return <div dir="rtl" />; }',
    });
    expect(isPropHost(path.join(root, 'Carousel.tsx'), fs.readFileSync(path.join(root, 'Carousel.tsx'), 'utf8'))).toBe(true);
    expect(insideNames(root)).toEqual(['Card.tsx', 'Slide.tsx']);
    const hosts = scanLtrHosts(root).hosts;
    expect(hosts[0].kind).toBe('prop');
    expect(hosts[0].callers.map((c) => path.basename(c))).toEqual(['Strip.tsx']);
  });

  it('looks through a withWidgetBoundary barrel to the real component file', () => {
    const root = fixture({
      'Carousel.tsx': `export function Carousel({ children }) { return <div dir="ltr">{children}</div>; }`,
      'Widgets.tsx': `import RealRaw from './Real'; export const Real = withWidgetBoundary(RealRaw, 'x');`,
      'Page.tsx': `import { Carousel } from './Carousel'; import { Real } from './Widgets';
export default function Page() { return <Carousel><Real /></Carousel>; }`,
      'Real.tsx': 'export default function Real() { return <div dir="rtl" />; }',
    });
    expect(insideNames(root)).toContain('Real.tsx');
  });

  it('a non-rtl style direction counts as an override; direction: rtl and plain files do not', () => {
    const rtl = fixture({
      'A.tsx': `import B from './B'; export default function A() { return <div style={{ direction: 'rtl' }}><B /></div>; }`,
      'B.tsx': 'export default function B() { return <p />; }',
    });
    expect(scanLtrHosts(rtl).hosts).toEqual([]);
    const dyn = fixture({
      'A.tsx': `import B from './B'; export default function A({ d }) { return <div style={{ direction: d }}><B /></div>; }`,
      'B.tsx': 'export default function B() { return <p />; }',
    });
    expect(insideNames(dyn)).toEqual(['B.tsx']);
  });
});
