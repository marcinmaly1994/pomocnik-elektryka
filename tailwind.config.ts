import type { Config } from "tailwindcss";

// Paleta przeniesiona z oryginalnego pliku PomocnikElektryka.jsx ("schemat kreślarski + miedź"),
// zdefiniowana teraz jako właściwy motyw Tailwind zamiast rozproszonych wartości hex w stylach inline.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16202B",
        blueprint: "#2D5A8C",
        copper: "#C1793F",
        paper: "#EEF1F4",
        ok: "#3B8C63",
        warn: "#C6433A",
        border: "#DFE4E9",
      },
      fontFamily: {
        sans: ["Inter Tight", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        DEFAULT: "6px",
        card: "7px",
      },
    },
  },
  plugins: [],
} satisfies Config;
