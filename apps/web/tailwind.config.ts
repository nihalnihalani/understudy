import type { Config } from "tailwindcss";

/**
 * Tokens are declared in apps/web/src/theme.css as HSL triplets on :root
 * and [data-theme="light"]. This config wires Tailwind's colour utilities
 * to those CSS variables so `bg-primary/20`, `text-muted`, etc. compose
 * with Tailwind's alpha modifier.
 *
 * Legacy palette keys (canvas, fg, border.subtle, accent.*) are preserved
 * so the existing pages in apps/web/src/pages/* keep compiling while
 * tasks #20 and #21 rebuild them.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // semantic shadcn-style tokens
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        elevated: "hsl(var(--elevated))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        faint: "hsl(var(--faint))",
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: "hsl(var(--border))",
          strong: "hsl(var(--border-strong))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          700: "hsl(var(--primary-strong))",
          300: "hsl(var(--primary-soft))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          // legacy — named accents still referenced by existing pages
          cyan: "hsl(var(--accent))",
          emerald: "hsl(var(--success))",
          amber: "hsl(var(--warning))",
          crimson: "hsl(var(--destructive))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        brand: {
          indigo: "hsl(var(--brand-indigo))",
          purple: "hsl(var(--brand-purple))",
          pink: "hsl(var(--brand-pink))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
        // legacy compatibility — mirrors the pre-rebuild palette so existing
        // components keep compiling during tasks #20/#21.
        canvas: {
          DEFAULT: "hsl(var(--background))",
          surface: "hsl(var(--surface))",
          elevated: "hsl(var(--elevated))",
        },
        fg: {
          DEFAULT: "hsl(var(--foreground))",
          muted: "hsl(var(--muted))",
          faint: "hsl(var(--faint))",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        ring: "var(--shadow-ring)",
      },
      fontSize: {
        "mono-xs": ["10px", { lineHeight: "1.6" }],
        "mono-sm": ["11px", { lineHeight: "1.6" }],
        "mono-base": ["12px", { lineHeight: "1.6" }],
        "mono-lg": ["13px", { lineHeight: "1.6" }],
      },
      transitionDuration: {
        fast: "100ms",
        DEFAULT: "160ms",
        slow: "240ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0.8, 0.2, 1)",
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
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-out-right": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "border-beam": {
          "100%": {
            "offset-distance": "100%",
          },
        },
        "shiny-text": {
          "0%, 90%, 100%": {
            "background-position": "calc(-100% - var(--shiny-width)) 0",
          },
          "30%, 60%": {
            "background-position": "calc(100% + var(--shiny-width)) 0",
          },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        grid: {
          "0%": { transform: "translateY(-50%)" },
          "100%": { transform: "translateY(0)" },
        },
        meteor: {
          "0%": { transform: "rotate(215deg) translateX(0)", opacity: "1" },
          "70%": { opacity: "1" },
          "100%": {
            transform: "rotate(215deg) translateX(-500px)",
            opacity: "0",
          },
        },
      },
      animation: {
        "pulse-dot": "pulseDot 1.2s ease-in-out infinite",
        caret: "caret 1s step-end infinite",
        meter: "meter 2s linear infinite",
        "fade-in": "fade-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "slide-up": "slide-up 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "slide-in-right": "slide-in-right 240ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "slide-out-right":
          "slide-out-right 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "scale-in": "scale-in 100ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "border-beam": "border-beam var(--duration) infinite linear",
        "shiny-text": "shiny-text var(--duration) infinite",
        scan: "scan 8s linear infinite",
        grid: "grid 15s linear infinite",
        "meteor-effect": "meteor 5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
