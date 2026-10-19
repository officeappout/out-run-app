/** Static-markup render checks for the result cards: brand styling, a11y, matched text in bold. */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/lib/bunny/bunny.config', () => ({ buildBunnyThumbnailUrl: (id: string) => `https://cdn.example/${id}/thumbnail.jpg` }));

import PlaceRow from '../components/cards/PlaceRow';
import ArticleCard from '../components/cards/ArticleCard';
import QaRow from '../components/cards/QaRow';
import CategoryChips from '../components/CategoryChips';
import GroupResultCard from '../components/cards/GroupResultCard';

describe('result cards', () => {
  it('PlaceRow: brand border, bold match, distance, a real button with a label', () => {
    const html = renderToStaticMarkup(
      <PlaceRow hit={{ kind: 'park', key: 'park:1', id: '1', title: 'גינת כושר פארק הירקון', subtitle: 'תל אביב', score: 60, distanceKm: 1.24 }} query="הירקון" onOpen={() => {}} />,
    );
    expect(html).toContain('<button');
    expect(html).toContain('linear-gradient(135deg,#00baf7,#0cf2e3) border-box');
    expect(html).toContain('<b class="font-black text-[#04222b]">הירקון</b>');
    expect(html).toContain('1.2 ק״מ');
    expect(html).toContain('aria-label="גינה: גינת כושר פארק הירקון, 1.2 ק״מ ממך"');
  });
  it('ArticleCard: website category colours, read time, 900 title, 16:10 cover', () => {
    const article = { id: 'a', type: 'article', slug: 's', title: 'בטן חזקה בלי כפיפות', excerpt: '', body: [], category: 'running', cover: { video: 'vid-12345678' }, readMin: 4, tags: [] } as never;
    const html = renderToStaticMarkup(<ArticleCard article={article} query="בטן" onOpen={() => {}} />);
    expect(html).toContain('background:#dcfce7;color:#047857');
    expect(html).toContain('4 דק׳ קריאה');
    expect(html).toContain('font-black');
    expect(html).toContain('aspect-[16/10]');
    expect(html).toContain('https://cdn.example/vid-12345678/thumbnail.jpg');
  });
  it('QaRow is a disclosure (aria-expanded) and closed by default', () => {
    const html = renderToStaticMarkup(<QaRow q="איך מזיזים אימון?" a={['בלו״ז']} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('בלו״ז');
  });
  it('CategoryChips: tablist in the canvas order, counts only when given', () => {
    const counts = { all: 14, exercises: 8, parks: 0, routes: 0, social: 1, events: 0, articles: 2, help: 3 };
    const html = renderToStaticMarkup(<CategoryChips value="all" onChange={() => {}} counts={counts} />);
    expect(html).toContain('role="tablist"');
    const labels = Array.from(html.matchAll(/role="tab"[^>]*>([^<]+)/g)).map((m) => m[1]);
    expect(labels).toEqual(['הכל', 'תרגילים', 'גינות', 'מסלולים', 'אנשים וקבוצות', 'אירועים', 'מאמרים', 'עזרה']);
    expect(html).toContain('תרגילים<span class="tabular-nums"> · 8</span>');
    expect(html).toContain('גינות</button>');
  });
  it('GroupResultCard feature: gradient header + join button', () => {
    const group = { id: 'g', name: 'רצי פלורנטין', description: '', category: 'running', memberCount: 42, scheduleSlots: [{ dayOfWeek: 2, time: '19:30', frequency: 'weekly' }] } as never;
    const html = renderToStaticMarkup(<GroupResultCard group={group} distanceKm={0.8} variant="feature" joined={false} joining={false} onOpen={() => {}} onJoin={() => {}} />);
    expect(html).toContain('800 מ׳ ממך');
    expect(html).toContain('הצטרפות');
    expect(html).toContain('42 חברים');
    expect(html).toContain('ג׳ · 19:30');
  });
});
