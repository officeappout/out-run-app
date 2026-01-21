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
        "card-light": "#ffffff",
        "background-light": "#f5f5f7",
      },
      boxShadow: {
        subtle: '0 1px 3px rgba(0,0,0,0.05)',
        floating: '0 4px 12px rgba(0,0,0,0.15)',
        drawer: '0 -4px 24px rgba(0,0,0,0.08)',
      },
      borderRadius: {
        xl: "16px",
        "2xl": "24px",
        "3xl": "32px",
      },
      fontFamily: {
        sans: ["Heebo", "sans-serif"],
        // הגדרת הפונט SimplerPro
        simpler: ["var(--font-simpler)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;