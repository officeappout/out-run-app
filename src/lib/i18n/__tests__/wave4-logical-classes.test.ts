import { describe, it, expect } from 'vitest';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { mapClassToken, mapClassString, splitVariants } from '../wave4/logical-classes';

describe('wave4 mapClassToken (RTL pixel-identical mapping)', () => {
  const cases: Array<[string, string]> = [
    ['ml-2', 'me-2'], ['mr-2', 'ms-2'], ['pl-4', 'pe-4'], ['pr-4', 'ps-4'],
    ['-ml-2', '-me-2'], ['ml-auto', 'me-auto'], ['mr-[10px]', 'ms-[10px]'],
    ['left-0', 'end-0'], ['right-0', 'start-0'], ['-right-1', '-start-1'], ['left-[5%]', 'end-[5%]'],
    ['text-left', 'text-end'], ['text-right', 'text-start'],
    ['rounded-l', 'rounded-e'], ['rounded-r-xl', 'rounded-s-xl'],
    ['rounded-tl-lg', 'rounded-se-lg'], ['rounded-tr-lg', 'rounded-ss-lg'],
    ['rounded-bl', 'rounded-ee'], ['rounded-br-2xl', 'rounded-es-2xl'],
    ['border-l', 'border-e'], ['border-r-2', 'border-s-2'], ['border-l-red-500', 'border-e-red-500'],
    ['float-left', 'float-end'], ['sm:ml-2', 'sm:me-2'], ['md:hover:!pr-3', 'md:hover:!ps-3'],
    ['[&>svg]:ml-1', '[&>svg]:me-1'], ['scroll-pl-2', 'scroll-pe-2'],
  ];
  it.each(cases)('%s -> %s', (a, b) => expect(mapClassToken(a)).toBe(b));

  it.each(['flex', 'text-center', 'ms-2', 'pe-1', 'start-0', 'text-start', 'rtl:ml-2', 'ltr:mr-2', 'left', 'right', 'ml-', 'space-x-2', 'inset-x-0', 'rounded-lg', 'rounded-full', 'border-2', 'border-red-500', 'pl', 'text-left-foo-x'.replace('text-left-foo-x', 'bg-left'), 'translate-x-2'])(
    '%s is left alone',
    (t) => expect(mapClassToken(t)).toBeNull(),
  );

  it('splits arbitrary variants with colons', () => {
    expect(splitVariants('[&:hover]:ml-2')).toEqual({ variants: '[&:hover]:', base: 'ml-2' });
  });

  it('maps strings, preserves whitespace, keeps left/right physical next to translate-x centering', () => {
    expect(mapClassString('flex  ml-2 text-right').text).toBe('flex  me-2 text-start');
    expect(mapClassString('absolute left-1/2 -translate-x-1/2 pr-2').text).toBe('absolute left-1/2 -translate-x-1/2 ps-2');
  });

  it('does not touch template tokens glued to an interpolation', () => {
    expect(mapClassString('a ml-2', { skipLast: true }).text).toBe('a ml-2');
    expect(mapClassString(' ml-2 ', { skipLast: true }).text).toBe(' me-2 ');
  });
});

/** Cross-check against real Tailwind output: old physical CSS == new logical CSS resolved in RTL. */
describe('wave4 mapping matches Tailwind 3.4 generated CSS', () => {
  const RTL_EQUIV: Record<string, string> = {
    'margin-left': 'margin-inline-end', 'margin-right': 'margin-inline-start',
    'padding-left': 'padding-inline-end', 'padding-right': 'padding-inline-start',
    left: 'inset-inline-end', right: 'inset-inline-start',
    'text-align': 'text-align', float: 'float', clear: 'clear',
    'border-left-width': 'border-inline-end-width', 'border-right-width': 'border-inline-start-width',
    'border-top-left-radius': 'border-start-end-radius', 'border-top-right-radius': 'border-start-start-radius',
    'border-bottom-left-radius': 'border-end-end-radius', 'border-bottom-right-radius': 'border-end-start-radius',
  };
  const RTL_VALUE: Record<string, string> = { left: 'end', right: 'start' };

  async function decls(cls: string): Promise<Array<[string, string]>> {
    const res = await postcss([tailwind({ content: [{ raw: cls }], corePlugins: { preflight: false } } as never)]).process(
      '@tailwind utilities;', { from: undefined });
    const out: Array<[string, string]> = [];
    res.root.walkDecls((d) => { if (!d.prop.startsWith('--')) out.push([d.prop, d.value]); });
    return out;
  }
  const samples = ['ml-2', 'mr-2', 'pl-3', 'pr-3', 'left-0', 'right-4', 'text-left', 'text-right', 'rounded-l-lg', 'rounded-r-lg',
    'rounded-tl-xl', 'rounded-tr-xl', 'rounded-bl-xl', 'rounded-br-xl', 'border-l-2', 'border-r-2', 'float-left', 'float-right'];

  it.each(samples)('%s', async (cls) => {
    const logical = mapClassToken(cls)!;
    const [phys, log] = [await decls(cls), await decls(logical)];
    expect(log.length).toBeGreaterThan(0); // the target class exists in Tailwind 3.4.1
    const expected = phys.map(([p, v]) => [RTL_EQUIV[p] ?? p, p === 'float' || p === 'clear' ? `inline-${RTL_VALUE[v] ?? v}` : (p === 'text-align' ? RTL_VALUE[v] ?? v : v)]);
    expect(log.map(([p, v]) => `${p}:${v}`).sort()).toEqual(expected.map(([p, v]) => `${p}:${v}`).sort());
  });
});
