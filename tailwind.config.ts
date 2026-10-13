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
      },
      backgroundImage: {
        // Primary brand CTA fill (BrandCtaButton). Pair with `text-on-brand`.
        "brand-cta": "linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)",
      },
      boxShadow: {
        // Premium OUT design system - subtle, professional shadows
        subtle: '0 1px 3px rgba(0,0,0,0.05)',
        floating: '0 4px 12px rgba(0,0,0,0.15)',
        drawer: '0 -4px 24px rgba(0,0,0,0.08)',
        premium: '0 4px 20px rgba(91,194,242,0.06)',
        'premium-hover': '0 8px 30px rgba(91,194,242,0.10)',
        card: '0 2px 12px rgba(0,0,0,0.04)',
      },
      borderRadius: {
        // Premium OUT design system - refined, elegant corners
        lg: "10px",      // Small elements (buttons, chips)
        xl: "12px",      // Medium elements (input fields, small cards)
        "2xl": "14px",   // Standard cards
        "3xl": "20px",   // Large containers, bottom sheets
        "4xl": "28px",   // Extra large hero cards (use sparingly)
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