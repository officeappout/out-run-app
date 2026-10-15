import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'manual', // Lock to light mode - no automatic dark mode switching
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // הגדרות הצבעים שביקשת
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: "#00dcd0",
        secondary: "#ea1d24",
        "out-blue": "#007aff",
        // Brand sky-blue used across the running player (lap circles,
        // turn carousel accents, recenter button). Formalised as a
        // token so the dozens of one-off `#00ADEF` / `#00BAF7` /
        // `#00E5FF` literals can collapse to a single source of truth.
        "out-cyan": "#00ADEF",
        // Text/icon colour for anything drawn ON a brand-cyan fill (#5BC2F2/#00BAF7/#00C9F2/#0CF2E3
        // gradients, bg-cyan-*, bg-primary). White on those fills is 1.4-2.4:1 (fails WCAG AA);
        // slate-900 gives 6.9-12.5:1. Use `text-on-brand`, never `text-white`, on a brand fill.
        "on-brand": "#0F172A",
        "card-light": "#ffffff",
        "background-light": "#f5f5f7",
        // Dark mode colors (for StrengthDopamineScreen & future dark mode)
        "card-dark": "#1E293B",
        "background-dark": "#0F172A",
        // ── Design language v2 (marketing-site language) ─────────────────
        // Additive: nothing above changes. Values + rules:
        // .claude/knowledge/design-language.md (v2). Mirrors --v2-* in
        // globals.css and src/components/ui/v2/tokens.ts.
        v2: {
          accent: "#00baf7",
          cyan: "#00c9f2",
          teal: "#00dcd0",
          "on-cta": "#04222b",
          deep: "#0284c7",
          ink: "#0e1419",
          "ink-2": "#4b5a66",
          muted: "#64748b",
          surface: "#f6fbfd",
          tint: "#eef8fc",
          hairline: "#e6edf2",
          "hairline-cool": "#e6f0f4",
          "pill-border": "#dfe7ed",
          gold: "#ffc83d",
          "on-gold": "#7a4a00",
          amber: "#f59e0b",
          up: "#10b981",
          down: "#e5484d",
        },
        // Semantic activity accents — the only non-brand hues allowed.
        activity: {
          steps: "#00c07a",
          run: "#00c9f2",
          bike: "#39d98a",
        },
      },
      backgroundImage: {
        // Primary brand CTA fill (BrandCtaButton). Pair with `text-on-brand`.
        "brand-cta": "linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)",
        // v2 primary CTA (same gradient, lowercase site spelling). Pair with `text-v2-on-cta`.
        "v2-cta": "linear-gradient(135deg, #00baf7, #0cf2e3)",
      },
      transitionTimingFunction: {
        v2: "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      letterSpacing: {
        "v2-tight": "-0.02em",
        "v2-tighter": "-0.03em",
      },
      boxShadow: {
        // Premium OUT design system - subtle, professional shadows
        subtle: '0 1px 3px rgba(0,0,0,0.05)',
        floating: '0 4px 12px rgba(0,0,0,0.15)',
        drawer: '0 -4px 24px rgba(0,0,0,0.08)',
        premium: '0 4px 20px rgba(91,194,242,0.06)',
        'premium-hover': '0 8px 30px rgba(91,194,242,0.10)',
        card: '0 2px 12px rgba(0,0,0,0.04)',
        // v2 — soft, negative-spread, navy-tinted (rgba(9,30,50,…)); never heavy black.
        'v2-ring': '0 0 0 1px rgba(14,27,42,0.08)',
        'v2-card': '0 24px 50px -36px rgba(9,30,50,0.45), 0 0 0 1px rgba(14,27,42,0.06)',
        'v2-card-dark': '0 24px 50px -30px rgba(9,30,50,0.6)',
        'v2-float': '0 28px 56px -24px rgba(9,30,50,0.45), 0 0 0 1px rgba(14,27,42,0.06)',
        'v2-cta': 'inset 0 1px 0 rgba(255,255,255,0.5), 0 10px 26px -12px rgba(0,186,247,0.7)',
        'v2-sheet': '0 -18px 40px -24px rgba(9,30,50,0.45), 0 0 0 1px rgba(14,27,42,0.06)',
      },
      borderRadius: {
        // Premium OUT design system - refined, elegant corners
        lg: "10px",      // Small elements (buttons, chips)
        xl: "12px",      // Medium elements (input fields, small cards)
        "2xl": "14px",   // Standard cards
        "3xl": "20px",   // Large containers, bottom sheets
        "4xl": "28px",   // Extra large hero cards (use sparingly)
        // v2: cards 22–28 (24 default), inner tiles 12–18 (14 default).
        "v2-card": "24px",
        "v2-card-lg": "28px",
        "v2-tile": "14px",
      },
      fontFamily: {
        // Simpler Pro as primary sans font
        sans: ["'Simpler Pro'", "Heebo", "sans-serif"],
        // Simpler Pro utility class
        simpler: ["'Simpler Pro'", "sans-serif"],
        // Hebrew-optimized stack
        hebrew: ["'Simpler Pro'", "Assistant", "Rubik", "Arial Hebrew", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;