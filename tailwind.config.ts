import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
      },
      colors: {
        "fw-white": "#ffffff",
        "fw-card": "#f2f2f0",
        "fw-tab-active": "#e8e8e8",
        "fw-input-bg": "#fbfbfb",
        "fw-ink": "#111111",
        "fw-ink-mid": "#444444",
        "fw-ink-muted": "#888888",
        "fw-ink-faint": "#bbbbbb",
        "fw-border": "#e8e8e8",
        "fw-border-mid": "#d4d4d4",
        "app-bg": "#ffffff",
        "surface-card": "#f2f2f0",
        "tab-active": "#e8e8e8",
        "input-bg": "#fbfbfb",
        "text-primary": "#111111",
        "text-secondary": "#444444",
        "text-muted": "#888888",
        "text-faint": "#bbbbbb",
        "border-default": "#e8e8e8",
        "border-mid": "#d4d4d4",
      },
    },
  },
  plugins: [],
} satisfies Config;
