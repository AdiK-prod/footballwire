import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
      colors: {
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
