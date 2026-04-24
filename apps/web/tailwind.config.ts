import type { Config } from "tailwindcss";

// Tokens mirror the Stitch design system "Understudy Enterprise Governance".
// Any change here must also land in apps/web/src/styles/design-system.md
// and the Stitch project's `designMd`.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#0A0B10",
          surface: "#11131B",
          elevated: "#171A24",
        },
        border: {
          subtle: "#1E2230",
          strong: "#2A3042",
        },
        fg: {
          DEFAULT: "#E6E8F0",
          muted: "#9AA0B4",
          faint: "#5F6478",
        },
        primary: {
          DEFAULT: "#6366F1",
          700: "#4F46E5",
          300: "#A5B4FC",
        },
        accent: {
          cyan: "#22D3EE",
          emerald: "#34D399",
          amber: "#FBBF24",
          crimson: "#F87171",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
      },
      fontSize: {
        "mono-xs": ["10px", { lineHeight: "1.6" }],
        "mono-sm": ["11px", { lineHeight: "1.6" }],
        "mono-base": ["12px", { lineHeight: "1.6" }],
        "mono-lg": ["13px", { lineHeight: "1.6" }],
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        caret: {
          "0%, 100%": { opacity: "0" },
          "50%": { opacity: "1" },
        },
        meter: {
          "0%": { backgroundPositionX: "0%" },
          "100%": { backgroundPositionX: "200%" },
        },
      },
      animation: {
        "pulse-dot": "pulseDot 1.2s ease-in-out infinite",
        caret: "caret 1s step-end infinite",
        meter: "meter 2s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
