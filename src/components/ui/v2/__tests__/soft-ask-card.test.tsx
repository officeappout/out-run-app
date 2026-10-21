import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bell } from 'lucide-react';
import { SoftAskCard } from '../index';

const noop = () => {};

describe('SoftAskCard', () => {
  it('title, body, gradient primary; no secondary unless given', () => {
    const out = renderToStaticMarkup(
      <SoftAskCard icon={Bell} title="שנזכיר לך לפני אימון?" body="נזכיר לך רק לפני אימון" primaryLabel="כן, תזכירו לי" onPrimary={noop} />,
    );
    expect(out).toContain('data-v2-soft-ask');
    expect(out).toContain('שנזכיר לך לפני אימון?');
    expect(out).toContain('bg-v2-cta');
    expect(out).not.toContain('לא עכשיו');
  });
  it('tint primary + quiet secondary', () => {
    const out = renderToStaticMarkup(
      <SoftAskCard icon={Bell} title="t" body="b" primaryLabel="p" onPrimary={noop} secondaryLabel="לא עכשיו" onSecondary={noop} primaryTone="tint" />,
    );
    expect(out).not.toContain('bg-v2-cta');
    expect(out).toContain('bg-v2-tint');
    expect(out).toContain('לא עכשיו');
  });
});
