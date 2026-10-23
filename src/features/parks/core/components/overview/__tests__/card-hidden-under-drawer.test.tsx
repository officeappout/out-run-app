import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CardHiddenUnderDrawer from '../CardHiddenUnderDrawer';

describe('CardHiddenUnderDrawer — never a card and a drawer together', () => {
  it('flag off → the children with no wrapper (byte-identical)', () => {
    expect(renderToStaticMarkup(<CardHiddenUnderDrawer active={false} hidden><p>card</p></CardHiddenUnderDrawer>)).toBe('<p>card</p>');
  });
  it('drawer open → the card stays mounted but invisible and untappable', () => {
    const html = renderToStaticMarkup(<CardHiddenUnderDrawer active hidden><p>card</p></CardHiddenUnderDrawer>);
    expect(html).toContain('visibility:hidden');
    expect(html).toContain('pointer-events:none');
    expect(html).toContain('<p>card</p>');
  });
  it('drawer closed → visible', () => {
    expect(renderToStaticMarkup(<CardHiddenUnderDrawer active hidden={false}><p>card</p></CardHiddenUnderDrawer>)).not.toContain('visibility');
  });
});
