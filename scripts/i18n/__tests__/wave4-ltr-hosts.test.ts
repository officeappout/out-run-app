import { describe, expect, it, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanLtrHosts } from '../wave4-ltr-hosts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltr-hosts-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Writes fixtures under a fresh `src` root and returns the set of files (relative to src) found inside a host. */
function scan(name: string, files: Record<string, string>): Set<string> {
  const root = path.join(tmp, name, 'src');
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  const { inside } = scanLtrHosts(root);
  return new Set(Array.from(inside.keys()).map((k) => path.relative(root, path.resolve(k))));
}

const Slide = { 'Slide.tsx': 'export default function Slide() { return <span className="ml-0.5">km</span>; }' };
const Host = { 'StatsCarousel.tsx': 'export function StatsCarousel({ slides }: any) { return <div dir="ltr">{slides.map((s: any) => <s.component key={s.id} />)}</div>; }' };

describe('wave4 ltr-host scan: by-reference patterns', () => {
  it('flags `{ id, component: X }` slides built next to a host (the exact VSSlide case)', () => {
    const r = scan('vsslide', {
      ...Host,
      'StatsCarousel/VSSlide.tsx': Slide['Slide.tsx'],
      'layers/FreeRunLayer.tsx': `import StatsCarousel from '../StatsCarousel';\nimport VSSlide from '../StatsCarousel/VSSlide';\nexport const slides = [{ id: 'vs', component: VSSlide }];\nexport const L = () => <StatsCarousel slides={slides} />;`,
    });
    expect(r.has('StatsCarousel/VSSlide.tsx')).toBe(true);
  });
  it('flags a slide list file that only mentions the host in a comment', () => {
    const r = scan('builder', { ...Slide, 'build.ts': `import Slide from './Slide';\n// No changes needed in StatsCarousel.\nexport const build = () => [{ id: 'a', component: Slide }];` });
    expect(r.has('Slide.tsx')).toBe(true);
  });
  it.each([
    ['Component={X}', `import Slide from './Slide';\nexport const A = () => <StatsCarousel Component={Slide} />;`],
    ['render: X', `import Slide from './Slide';\nexport const cfg = { render: Slide }; // StatsCarousel`],
    ['slides: [X, Y]', `import Slide from './Slide';\nexport const A = () => <StatsCarousel slides={[Slide]} />;`],
    ['React.createElement(X)', `import React from 'react';\nimport Slide from './Slide';\nexport const el = React.createElement(Slide); // StatsCarousel`],
    ['lazy(() => import())', `import { lazy } from 'react';\nexport const Lazy = lazy(() => import('./Slide')); // SuggestionCarousel`],
    ['array consumed by a carousel', `import Slide from './Slide';\nconst items = [Slide];\nexport const A = () => <WorkoutSelectionCarousel items={items} />;`],
    ['useDrag file', `import Slide from './Slide';\nimport { useDrag } from '@use-gesture/react';\nexport const cards = [Slide];`],
    ['dir="ltr" in the same file', `import Slide from './Slide';\nexport const A = () => <div dir="ltr">{[Slide].map((C) => <C key="x" />)}</div>;`],
  ])('flags %s', (name, body) => {
    expect(scan(`p-${name.replace(/\W/g, '')}`, { ...Slide, 'Use.tsx': body }).has('Slide.tsx')).toBe(true);
  });
  it('flags transitively: a component used by a card the host file lists', () => {
    const r = scan('transitive', {
      'Leaf.tsx': 'export default function Leaf() { return <i className="mr-1" />; }',
      'Card.tsx': `import Leaf from './Leaf';\nexport default function Card() { return <Leaf />; }`,
      'Use.tsx': `import Card from './Card';\n// DashedGoalCarousel\nexport const cards = [{ component: Card }];`,
    });
    expect(r.has('Card.tsx')).toBe(true);
    expect(r.has('Leaf.tsx')).toBe(true);
  });
  it('leaves unrelated components alone', () => {
    const r = scan('unrelated', { ...Slide, 'Page.tsx': `import Slide from './Slide';\nexport const P = () => <Slide />;` });
    expect(r.has('Slide.tsx')).toBe(false);
  });
});
