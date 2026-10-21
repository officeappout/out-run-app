/**
 * What the runner reads from the page at every step — ONE in-page script, kept as a string so
 * the bundler can't inject helpers into it (page.evaluate serialises functions). It:
 *   1. tags each visible interactive element with data-qa-ref="eN" and returns a compact list
 *      (role, label, box) — the tester acts by ref, which is cheap and replayable;
 *   2. gathers the DOM facts the deterministic linters judge (./rules.ts). Bounded lists only.
 * The judging itself is pure TypeScript (rules.ts), unit-tested on plain fact objects.
 */

export interface ElementInfo {
  ref: string;
  role: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled: boolean;
}

/** What kind of control it is, for the no-wrap rule (only short single labels must not wrap). */
export type ControlKind = 'button' | 'chip' | 'tab' | 'label' | 'link' | 'input' | 'other';

export interface ControlFact {
  label: string;
  w: number;
  h: number;
  kind: ControlKind;
  /** data-qa-nowrap on the element: always judged by V2-NOWRAP. */
  nowrapHint: boolean;
  /** Non-empty text nodes inside (capped at 5). A card with a title + body has several. */
  textNodes: number;
  /** Distinct line boxes of the tallest text node itself (icons / sibling spans don't count). */
  textLines: number;
  /** Rendered height of that text node and the computed line-height of its parent (px). */
  textHeight: number;
  lineHeight: number;
  clippedNoEllipsis: boolean;
  gradient: boolean;
  selected: boolean;
  /** Relative luminance of the computed background (null = transparent). */
  bgLuminance: number | null;
  inlineLink: boolean;
}

export interface PageFacts {
  url: string;
  viewport: { w: number; h: number };
  docScrollWidth: number;
  dir: string;
  smallTexts: Array<{ text: string; px: number }>;
  emojiTexts: string[];
  controls: ControlFact[];
  /** Elements marked data-qa-nowrap that are not controls (V2-NOWRAP only). */
  labels?: ControlFact[];
}

export interface Observation {
  elements: ElementInfo[];
  facts: PageFacts;
}

export const MAX_ELEMENTS = 80;

export const COLLECT_JS = String.raw`(() => {
  const MAX_EL = ${MAX_ELEMENTS};
  const vw = window.innerWidth, vh = window.innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return null;
    return r;
  };
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const labelOf = (el) => clean(el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || el.value || '');
  const lum = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    if (p.length === 4 && p[3] < 0.5) return null;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
  };
  // V2-NOWRAP facts: measured on the TEXT NODES only. A range over the whole element also
  // returns the boxes of icons / emoji / sibling spans at other heights (false "2 lines" on a
  // chip with an icon), and a card with a title + body is several blocks by design.
  const textOf = (el) => {
    const out = { nodes: 0, lines: 1, height: 0, lineHeight: 0 };
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = tw.nextNode())) {
      if (!(tn.textContent || '').trim()) continue;
      if (++out.nodes > 5) break;
      try {
        const range = document.createRange();
        range.selectNodeContents(tn);
        const rects = Array.from(range.getClientRects()).filter((q) => q.width > 1 && q.height > 1);
        const lines = new Set(rects.map((q) => Math.round(q.top / 2))).size || 1;
        const height = Math.round(range.getBoundingClientRect().height);
        const pcs = getComputedStyle(tn.parentElement || el);
        const fs = parseFloat(pcs.fontSize) || 14;
        const lh = parseFloat(pcs.lineHeight);
        if (height >= out.height) { out.lines = lines; out.height = height; out.lineHeight = Math.round((isFinite(lh) && lh > 0 ? lh : fs * 1.2) * 10) / 10; }
      } catch (e) {}
    }
    out.nodes = Math.min(out.nodes, 5);
    return out;
  };
  const kindOf = (el) => {
    const role = (el.getAttribute('role') || '').toLowerCase();
    const tag = el.tagName.toLowerCase();
    if (el.hasAttribute('data-qa-nowrap') || tag === 'label') return 'label';
    if (role === 'tab') return 'tab';
    if (['radio', 'option', 'checkbox', 'switch'].includes(role) || el.hasAttribute('aria-pressed')) return 'chip';
    if (tag === 'button' || role === 'button') return 'button';
    if (tag === 'a' || role === 'link') return 'link';
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return 'input';
    return 'other';
  };
  const SEL = 'button, a[href], [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=link], [role=option], input:not([type=hidden]), select, textarea, [onclick]';
  document.querySelectorAll('[data-qa-ref]').forEach((el) => el.removeAttribute('data-qa-ref'));
  const elements = [];
  const controls = [];
  let n = 0;
  for (const el of Array.from(document.querySelectorAll(SEL))) {
    const r = visible(el);
    if (!r) continue;
    const cs = getComputedStyle(el);
    const label = labelOf(el);
    if (elements.length < MAX_EL) {
      const ref = 'e' + (++n);
      el.setAttribute('data-qa-ref', ref);
      elements.push({ ref, role: el.getAttribute('role') || el.tagName.toLowerCase(), label, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true') });
    }
    if (controls.length >= 200) continue;
    const text = textOf(el);
    const state = el.getAttribute('data-state');
    controls.push({
      label,
      w: Math.round(r.width), h: Math.round(r.height),
      kind: kindOf(el),
      nowrapHint: el.hasAttribute('data-qa-nowrap'),
      textNodes: text.nodes, textLines: label ? text.lines : 1, textHeight: text.height, lineHeight: text.lineHeight,
      clippedNoEllipsis: el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis',
      gradient: /gradient\(/.test(cs.backgroundImage || '') && r.width * r.height > 1500,
      selected: el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true' || state === 'on' || state === 'active' || state === 'checked',
      bgLuminance: lum(cs.backgroundColor),
      inlineLink: el.tagName === 'A' && cs.display === 'inline',
    });
  }
  // Explicit no-wrap labels that are not controls (judged by V2-NOWRAP only).
  const labels = [];
  for (const el of Array.from(document.querySelectorAll('[data-qa-nowrap]'))) {
    if (labels.length >= 40 || el.matches(SEL)) continue;
    const r = visible(el);
    if (!r) continue;
    const cs = getComputedStyle(el);
    const text = textOf(el);
    labels.push({ label: labelOf(el), w: Math.round(r.width), h: Math.round(r.height), kind: 'label', nowrapHint: true, textNodes: text.nodes, textLines: text.lines, textHeight: text.height, lineHeight: text.lineHeight, clippedNoEllipsis: el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis', gradient: false, selected: false, bgLuminance: null, inlineLink: false });
  }
  const smallTexts = [];
  const emojiTexts = [];
  const seen = new Set();
  const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const t = (node.textContent || '').trim();
    if (!t) continue;
    const p = node.parentElement;
    if (!p || seen.has(p) || !visible(p)) continue;
    seen.add(p);
    const px = parseFloat(getComputedStyle(p).fontSize);
    if (px < 11 && smallTexts.length < 30) smallTexts.push({ text: clean(t), px });
    if (EMOJI.test(t) && emojiTexts.length < 20) emojiTexts.push(clean(t));
  }
  return {
    elements,
    facts: {
      url: location.pathname + location.search,
      viewport: { w: vw, h: vh },
      docScrollWidth: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0),
      dir: (document.documentElement.getAttribute('dir') || getComputedStyle(document.body).direction || ''),
      smallTexts, emojiTexts, controls, labels,
    },
  };
})()`;
