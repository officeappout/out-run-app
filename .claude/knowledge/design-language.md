# design-language.md — OUT Design Language v2

> **v2 (15.10.2026)** — the app adopts the visual language of the marketing site
> (`~/Development/appout-website`, read-only source). Every site value below was
> extracted from the site's CSS with a file:line citation; app values cite the app.
> v1 (the pre-v2 token inventory) is preserved in git history
> (`git log -- .claude/knowledge/design-language.md`) and §8 below still lists the
> legacy tokens, which keep working.
>
> Code: tokens in `tailwind.config.ts` (`v2-*`, `activity-*`), `src/app/globals.css`
> (`--v2-*`, `.v2-glass-*`), `src/components/ui/v2/tokens.ts` (JS side);
> primitives in `src/components/ui/v2/`.

---

## 1. Colour

One brand accent family (cyan → turquoise), ink, one secondary-text grey, a
tinted surface, a hairline. Semantic **activity** colours are the only other
hues allowed as accents.

| Token (Tailwind / CSS var) | Value | Role | Site source |
|---|---|---|---|
| `v2-accent` / `--v2-accent` | `#00baf7` | Accent: gradient start, chart strokes, active underline | 123 uses; `SiteHeader.module.css:146`, `Strength.module.css:489` |
| gradient end `--v2-cta-to` | `#0cf2e3` | Brand gradient end | 67 uses |
| `v2-cyan` | `#00c9f2` | Brand cyan var (`--brand-cyan`), app's historical primary | `globals.css:11` |
| `v2-teal` | `#00dcd0` | Brand turquoise var (defined, rarely used) | `globals.css:12` |
| `v2-on-cta` | `#04222b` | Text on the gradient (never white — contrast) | `SiteHeader.module.css:147` |
| `v2-deep` | `#0284c7` | Eyebrows, links, icon colour on a cyan tint | `Social.module.css:25,574` |
| `v2-ink` | `#0e1419` | Primary text, dark cards, dark pills | 105 uses; `Social.module.css:8` |
| `v2-ink-2` | `#4b5a66` | Secondary text (marketing voice) | `Social.module.css:41` |
| `v2-muted` | `#64748b` | Secondary text in app-replica UI, captions | `Strength.module.css:183` |
| `v2-surface` | `#f6fbfd` | Tinted page/section surface | `Social.module.css:55,445` |
| `v2-tint` | `#eef8fc` | Icon-tile / chip tint | `Social.module.css:171,573` |
| `v2-hairline` | `#e6edf2` | Hairline border (most common) | 13 uses; `Running.module.css:834` |
| `v2-hairline-cool` | `#e6f0f4` | Hairline on league/battle cards | `Social.module.css:56,542` |
| `v2-pill-border` | `#dfe7ed` | 1.5px ghost-pill border | `Strength.module.css:86` |
| `v2-gold` / `v2-on-gold` | `#ffc83d` / `#7a4a00` | Rank #1 crown tile | `Social.module.css:511-514` |
| `v2-amber` | `#f59e0b` | VS lightning, stars | `Social.module.css` `.vs` |
| `v2-up` / `v2-down` | `#10b981` / `#e5484d` | Delta ▲/▼ | green 16 uses on site |
| `activity-steps` / `--activity-steps` | `#00c07a` | Steps (semantic) | site `Steps.tsx:25,35`; app steps widgets |
| `activity-run` | `#00c9f2` | Running (semantic) | site `--activity-run` `globals.css:19` |
| `activity-cycle` (CSS `--activity-bike`) | `#39d98a` | Cycling (semantic) | site `--activity-bike` `globals.css:18` |

**Brief vs. site, corrected on extraction:** the brief named `#00c9f2` as the
accent; the site CSS actually uses `#00baf7` 123× and `#00c9f2` only inside
app-replica components. Both are tokens; `v2-accent` follows the site. The
brief's hairline `#e6f0f4` is real but rare — `#e6edf2` is the common one.

**Shadow colour** is always navy `rgba(9,30,50,…)` (or ring `rgba(14,27,42,…)`),
never black.

## 2. Surfaces, radii, shadows

| | Value | Token |
|---|---|---|
| Pills (buttons, chips, tracks) | `999px` | `rounded-full` |
| Cards | 22–28px (28 top-level tiles, 22 nested/side) | `rounded-v2-card` (24), `rounded-v2-card-lg` (28) |
| Inner tiles | 12–18px | `rounded-v2-tile` (14) |
| Card lift | `0 24px 50px -36px rgba(9,30,50,.45)` + ring `0 0 0 1px rgba(14,27,42,.06)` | `shadow-v2-card` |
| Hairline ring alone | `0 0 0 1px rgba(14,27,42,.08)` | `shadow-v2-ring` |
| Floating (glass) card | `0 28px 56px -24px rgba(9,30,50,.45)` + ring | `shadow-v2-float` |
| Bottom sheet | `0 -18px 40px -24px rgba(9,30,50,.45)` + ring | `shadow-v2-sheet` |
| Primary CTA | `inset 0 1px 0 rgba(255,255,255,.5), 0 10px 26px -12px rgba(0,186,247,.7)` | `shadow-v2-cta` |

Site sources: radii frequency table (999px ×118, 22px ×16, 28px ×13, 14px ×15,
12px ×20); shadows `Social.module.css:84`, `Strength.module.css:173`,
`SiteHeader.module.css:149`. **No heavy dark shadows** (`shadow-2xl`, black
0.2+ alphas) in v2.

**Dark accent card** (league board, `Social.module.css:463-528`): `#0e1419`,
radius 28, padding 26, no border/gradient. Inner rows `rgba(255,255,255,.06)`
radius 16, padding 14×16; tiles `rgba(255,255,255,.1)`. First row:
`linear-gradient(135deg, rgba(0,186,247,.35), rgba(12,242,227,.2))`. Rank tile:
30px circle `rgba(255,255,255,.1)`, 14/900; #1 = gold `#ffc83d` with a filled
crown in `#7a4a00`. Points 16/900 + unit 12/700 at .7 opacity.
→ `<Card variant="dark">` + `<CardTile tone="dark">`.

**Battle / head-to-head card** (`Social.module.css:533-595`): radius 22,
`linear-gradient(135deg,#e8f9fe,#e9fdfb)`, 1px `#e6f0f4`, white 42/14 icon
tile, two white pills around an amber lightning.

## 3. Buttons

| Variant | Spec | Primitive |
|---|---|---|
| Primary | gradient 135° `#00baf7→#0cf2e3`, text `#04222b`, 800 weight, pill, `shadow-v2-cta`, `:active scale(.97)` 160ms v2 curve. Heights: 44 (header) / 52 (hero) | `<Button variant="primary">` |
| Dark | `#0e1419` pill, white 800 | `<Button variant="dark">` |
| Ghost | white pill, `1.5px solid #dfe7ed`, ink text | `<Button variant="ghost">` |

Sizes in the primitive: `sm` 36px, `md` 44px, `lg` 56px. Site source:
`SiteHeader.module.css:138-157`, `Strength.module.css:65-88`, `Social.module.css:389-404`.

## 4. Glass

Three recipes, all in `globals.css` as `.v2-glass-bar | -card | -chip`, exposed
through `<GlassSurface recipe=…>` and `<Card variant="glass">`:

| Recipe | Background | Filter | Site source |
|---|---|---|---|
| Light glass bar | `linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.4))` + inset highlights | `blur(22px) saturate(185%)` | `SiteHeader.module.css:44-62` |
| Floating glass card | `rgba(255,255,255,.88)`, border `1px rgba(255,255,255,.9)`, `shadow-v2-float` | `blur(16px) saturate(180%)` | `Strength.module.css:162-175`, `HabitRoute.module.css:107-126` |
| Dark glass chip | `rgba(0,0,0,.35)`, border `1px rgba(255,255,255,.35)` | `blur(10px)` | `HeroDive.module.css:201-221` |

**Rules**
1. Glass only over rich content — map, video, imagery, colour gradients. Over
   flat white it's invisible and still costs a compositing layer.
2. Always ship `-webkit-backdrop-filter` (the CSS classes do).
3. Solid fallback via `@supports not (backdrop-filter…)` — the site has none;
   the app adds one because older Android WebViews lack the property.
4. Never stack blurred layers (a glass card inside a glass sheet) — Android
   WebView scroll cost. One blurred layer per scroll container.
5. Test scroll performance on a mid-range Android before merging a glass screen.

## 5. Type

- **Family:** Simpler Pro — the same face on site and app. The site ships a
  real 900 Black; the app maps 800/900 to Bold (`globals.css` @font-face) —
  `font-black` renders as Bold in the app until the Black OTF is added (open item).
- **Headlines:** heavy (900), short, tight tracking `-0.02em` (`tracking-v2-tight`),
  hero `-0.03em` (`tracking-v2-tighter`), line-height 1.02–1.08.
- **⚠ RTL override:** `globals.css` sets `[dir=rtl] h1…h6 { letter-spacing: .02em }`
  (specificity 0,1,1), which beats a single tracking class on an `h*`. Put v2
  tracking on a `span`/`div`, or use the `!` modifier.
- **Big stats:** 900 weight, `tabular-nums`, `line-height: 1`, tracking −0.03em
  → `<StatNumber>`; count-up 0.9s on the v2 ease-out (site `CountUp`,
  `authorities/motion.tsx:38-82`).
- **Step numerals "01":** `padStart(2,'0')`, brand gradient clipped to text,
  900 → `.v2-step-numeral` (`Journey.module.css:87-96`).
- **Eyebrows:** 14/800 `v2-deep`. **Body:** 15–16px, lead `v2-ink-2`.

## 6. Icons

- **Site:** `@phosphor-icons/react`, weight `bold` default, `fill` for emphasis
  (crown, lightning), inside a rounded-square tile: 42×42, radius 14,
  `#eef8fc` background, `#0284c7` icon (`Social.module.css:565-579`).
- **App decision (proposed): keep lucide, style it the same way.** The app
  imports lucide in hundreds of files (see the audit); a Phosphor migration is
  a large, low-value churn and would ship two icon sets during the transition.
  `<IconTile>` takes a lucide icon at `strokeWidth 2.4` to match Phosphor bold,
  in the site's tinted rounded square. If David later prefers Phosphor,
  `IconTile` is the single swap point for new code.
- **No emoji as UI icons.** Copy strings may keep a symbol only where it's part
  of the sentence.

## 7. Motion

| | Value | Token |
|---|---|---|
| Curve (everywhere) | `cubic-bezier(0.23, 1, 0.32, 1)` | `ease-v2`, `--v2-ease`, `EASE_V2` |
| Press | `scale(.97)`, 160–180ms | `PRESS_SCALE` (Button does it) |
| Chip/badge pop-in | spring stiffness 400, damping 15, from scale .6 | `SPRING_POP` (`Chip pop`) |
| Reveal | 0.7s, y 26→0 | — |
| Bars | `scaleY` 0→1, 0.5–0.6s, stagger 25–35ms | `BarChart` |
| Sheet settle | 0.42s on the v2 curve | `DraggableSheet` |

`prefers-reduced-motion`: every primitive reads `useReducedMotion()` — no press
scale, no pop, no stagger, count-up jumps to the value. Animate transform and
opacity only (no height/width per frame).

## 8. Mapping — current app patterns → v2

| Current app pattern | v2 replacement |
|---|---|
| `BrandCtaButton` / `bg-brand-cta text-on-brand shadow-md shadow-cyan-400/25` | `<Button variant="primary">` (same gradient, adds the site inset+glow shadow and 800 weight) |
| `bg-[#00E5FF] text-black rounded-xl` CTAs (e.g. `WorkoutSummaryPage` footer) | `<Button variant="primary" size="lg" block>` |
| `bg-black`/`bg-slate-900 rounded-full` pills | `<Button variant="dark">` |
| White bordered buttons `border border-gray-200 rounded-xl` | `<Button variant="ghost">` |
| `.premium-card`, `bg-white rounded-2xl shadow-card` / `shadow-sm` | `<Card>` (`rounded-v2-card shadow-v2-card`) |
| `shadow-lg` / `shadow-xl` / `shadow-2xl` on cards | `shadow-v2-card` (light) or `shadow-v2-float` (floating) |
| `rounded-2xl` (14px) as a card radius | `rounded-v2-card` (24px); keep 14 for inner tiles (`rounded-v2-tile`) |
| `card-dark` `#1E293B` / `bg-slate-800` dark cards | `<Card variant="dark">` (`#0e1419`) + `bg-white/10` tiles |
| `backdrop-blur-md bg-white/80` ad-hoc glass | `<GlassSurface recipe="card">` (prefixed + fallback) |
| `bg-black/40 backdrop-blur` chips over map/video | `<GlassSurface recipe="chip">` / `<Chip tone="glass-dark">` |
| Emoji icons (⏱ 🔁 📍 ✓ 🔥 🏆 …) | `<IconTile icon={Timer}>` etc. (lucide) |
| `text-[#00C9F2]` / `#5BC2F2` / `#4AADE3` / `#00E5FF` one-offs | `text-v2-accent` (chart/active) or `text-v2-deep` (text on tint) |
| Steps green `#00C07A` literals | `activity-steps` |
| Hand-rolled bottom sheets with no drag (summary drawer) | `<DraggableSheet>` — drag collapses/snaps, actions are explicit footer buttons |
| Recharts/hand-rolled bars | `<BarChart>` |
| Big numbers `text-4xl font-bold` | `<StatNumber size="lg|hero">` |
| `ease-out`/`ease-in-out` Tailwind transitions | `ease-v2` |
| `active:scale-95` / `0.98` | `0.97` (Button default) |

## 9. Rules (checklist for every v2 screen PR)

1. One accent family per screen + at most one semantic activity colour.
2. Cards 24/28 radius, tiles 14; pills for every button and chip.
3. Shadows from the v2 set only; no black shadows.
4. Glass only over rich content, max one blurred layer per scroll container,
   with the CSS-class recipes (never hand-rolled `backdrop-blur`).
5. Headlines heavy + tight; numbers tabular via `StatNumber`.
6. Icons: lucide inside `IconTile`; no emoji UI icons.
7. Motion: v2 curve, press .97, reduced-motion respected, transform/opacity only.
8. Z-index: only registered values (`.cursorrules`, axioms §8).
9. Screen PRs: before/after screenshots at 390px (RTL; dark surfaces where
   relevant), no logic changes beyond the stated scope, no map-owned files
   (`AppMap`, `MapShell`, `DiscoverLayer`, `TurnCarousel`), HOLD for David's
   visual approval.
10. Labels never wrap where they shouldn't (David, 17.10.2026): every chip /
    pill / button label is `whitespace-nowrap`; a row of pills is
    `min-w-0` with `shrink-0` pills, and if it can't fit it scrolls or the
    pills get more compact (h-9, px-2.5, 12.5px) — never a two-line "30 דק׳".
    Check every screen at **360px** (small Android) as well as 390px.
11. Colour hierarchy: one filled brand gradient per screen (the primary
    action). Selection = soft tint; the streak flames carry the brand colour
    in the schedule; everything else white or ink.

## 10. Legacy tokens (still valid, not v2)

`primary #00dcd0`, `secondary #ea1d24`, `out-blue #007aff`, `out-cyan #00ADEF`,
`on-brand #0F172A`, `card-light`, `background-light #f5f5f7`, `card-dark #1E293B`,
`background-dark #0F172A`; shadows `subtle | floating | drawer | premium |
premium-hover | card`; radii `lg 10 | xl 12 | 2xl 14 | 3xl 20 | 4xl 28`;
`.premium-card*`, `.premium-btn`; keyframes `heroMarkerPulse | fadeIn |
fadeInUp | swapSpin`. Z-index budget unchanged — see `.cursorrules` lines 31–45.

## 11. Open items

- Simpler Pro **Black (900)** OTF isn't bundled in the app — `font-black` falls
  back to Bold. Copying `SimplerPro-Black.otf` from the site is a one-line
  follow-up (visual change → screenshot approval).
- `.v2-glass-*` fallback is untested on a real pre-`backdrop-filter` WebView.
