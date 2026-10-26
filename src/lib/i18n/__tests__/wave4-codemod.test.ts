import { describe, it, expect } from 'vitest';
import { transform } from '../../../../scripts/i18n/wave4-codemod';

const run = (code: string) => transform('x.tsx', code).out;

describe('wave4 codemod transform', () => {
  it('maps classes, removes dir="rtl", mirrors lucide chevrons', () => {
    const out = run(`import { ChevronLeft } from 'lucide-react';
export const A = () => (<div dir="rtl" className={cn("ml-2 text-right", \`pr-3 \${x}\`)}><ChevronLeft className="w-4" /><ChevronLeft /></div>);`);
    expect(out).toContain('<div className={cn("me-2 text-start", `ps-3 ${x}`)}>');
    expect(out).toContain('<ChevronLeft className="w-4 ltr:-scale-x-100" />');
    expect(out).toContain('<ChevronLeft className="ltr:-scale-x-100" />');
  });
  it('leaves dir="ltr" subtrees, direction conditionals and non-className strings alone', () => {
    const code = `export const A = () => (<div><span dir="ltr" className="ml-2"><b className="pr-1" /></span>
<i className={isRtl ? 'ml-1' : 'mr-1'} /><u title="ml-2" /></div>);`;
    expect(run(code)).toBe(code);
  });
  it('follows dir={direction}: logical classes stay correct, dir untouched', () => {
    const out = run(`export const A = () => <div dir={direction} className="ml-2" />;`);
    expect(out).toContain('dir={direction} className="me-2"');
  });
  it('does not remove dir="rtl" nested under dir="ltr"', () => {
    const code = `export const A = () => <p dir="ltr"><i dir="rtl" /></p>;`;
    expect(run(code)).toBe(code);
  });
});
