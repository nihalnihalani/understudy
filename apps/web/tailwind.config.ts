import type { Config } from "tailwindcss";

// Tokens mirror TRUE's "CBC // Command — Mission Telemetry" theme.
// Amber is the signature accent; Fraunces (display, italic) marks emphasis.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#070810",   // --bg
          surface: "#10131c",   // --surface
          elevated: "#151826",  // --surface-2
          panel: "#12151f",     // --panel
        },
        border: {
          subtle: "rgba(255,255,255,0.06)",  // --hairline
          strong: "rgba(255,255,255,0.14)",  // --hairline-strong
        },
        fg: {
          DEFAULT: "#e8ecf1",   // --text
          muted: "#9aa3b2",     // --text-dim
          faint: "#6b7282",     // --muted
          dim: "#4a5163",       // --dim
        },
        primary: {
          DEFAULT: "#ff9d2a",   // amber — TRUE's signature accent
          700: "#e2861d",
          300: "#ffb85e",
          soft: "rgba(255, 157, 42, 0.12)",
        },
        accent: {
          amber: "#ff9d2a",
          signal: "#5aa8ff",
          cyan: "#5aa8ff",
          emerald: "#57d28e",
          ok: "#57d28e",
          warn: "#ffb547",
          bad: "#ff5c67",
          crimson: "#ff5c67",
          violet: "#b28bff",
        },
      },
      fontFamily: {
        display: [
          "Fraunces",
          "Iowan Old Style",
          "Apple Garamond",
          "Georgia",
          "serif",
        ],
        sans: [
          "IBM Plex Sans",
          "SF Pro Text",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "IBM Plex Mono",
          "SF Mono",
          "ui-monospace",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "0",  // TRUE uses square panels
        md: "2px",
        lg: "0",
      },
      fontSize: {
        "mono-xs": ["10px", { lineHeight: "1.6", letterSpacing: "0.16em" }],
        "mono-sm": ["11px", { lineHeight: "1.6", letterSpacing: "0.08em" }],
        "mono-base": ["12px", { lineHeight: "1.6" }],
        "mono-lg": ["13px", { lineHeight: "1.6" }],
      },
      keyframes: {
        pulse: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.85)" },
        },
        heartbeat: {
          "0%, 100%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(87,210,142,0.55)" },
          "20%": { transform: "scale(1.25)", boxShadow: "0 0 0 4px rgba(87,210,142,0.18)" },
          "40%": { transform: "scale(1)", boxShadow: "0 0 0 8px rgba(87,210,142,0)" },
          "60%": { transform: "scale(1.15)", boxShadow: "0 0 0 6px rgba(87,210,142,0.10)" },
          "80%": { transform: "scale(1)", boxShadow: "0 0 0 0 rgba(87,210,142,0)" },
        },
        marquee: {
          "0%": { transform: "translate3d(0,0,0)" },
          "100%": { transform: "translate3d(-50%,0,0)" },
        },
      },
      animation: {
        "pulse-dot": "pulse 1.4s ease-in-out infinite",
        heartbeat: "heartbeat 1.2s ease-in-out infinite",
        marquee: "marquee 60s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
