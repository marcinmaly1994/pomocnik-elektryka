import type { Config } from "tailwindcss";
import { KOLORY_TAILWIND, PROMIENIE, CIENIE } from "./src/lib/tokeny";

// Paleta przeniesiona z oryginalnego pliku PomocnikElektryka.jsx ("schemat kreślarski + miedź"),
// zdefiniowana teraz jako właściwy motyw Tailwind zamiast rozproszonych wartości hex w stylach inline.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tekst wtórny: domyślne slate-400/500 Tailwinda (#94A3B8 / #64748B) dawały na
        // białym 2,6:1 i 4,8:1, a na tle `paper` 2,3:1 i 4,2:1 — poniżej progu AA (4,5:1).
        // Audyt axe-core wskazał ok. 540 takich miejsc na czternastu widokach. Te dwa
        // stopnie są w kodzie używane WYŁĄCZNIE jako kolor tekstu (żadnych ramek ani teł),
        // więc przyciemnienie ich w motywie jest bezpieczniejsze niż przepisywanie 300
        // użyć. Kolejność jasności zostaje: 400 jaśniejszy od 500, a 600 bez zmian.
        // Najsłabsze tło w aplikacji (#ECECED) daje po zmianie 4,7:1 i 5,7:1.
        slate: { 400: "#5B6A80", 500: "#4F5D73" },
        // Miedź marki (wartości są teraz w src/lib/tokeny.ts),
        // przyciemniona z #C1793F: biały tekst na niej miał 3,5:1, a ona sama
        // na tle `paper` 3,0:1 — oba poniżej progu AA (4,5:1). Teraz 5,4:1 na bieli,
        // 4,8:1 na paper i 4,6:1 na najciemniejszym tle w aplikacji (#ECECED). Dotyczy
        // wyłącznie interfejsu (tekst, przyciski, ramki z tej klasy). Kolory DANYCH rysunku
        // — oprawy oświetlenia, obwody, ostrzeżenia na planie — zostają #C1793F: to
        // grafika, dla której próg to 3:1, a zmiana przestawiałaby też PDF-y i legendy.
        ...KOLORY_TAILWIND,
      },
      fontFamily: {
        // „Inter Tight Variable" PRZED „Inter Tight": pierwsza to nazwa, pod którą
        // zgłasza się plik wczytywany w `main.tsx` (tak nazywa odmiany zmienne
        // `@fontsource-variable`), druga zostaje dla kogoś, kto ma zwykły Inter Tight
        // zainstalowany w systemie. Reszta listy to zamienniki na wypadek, gdyby plik
        // nie doszedł — i to WYŁĄCZNIE one działały, zanim krój zaczął być wczytywany.
        sans: ["Inter Tight Variable", "Inter Tight", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        DEFAULT: PROMIENIE.maly,
        sm: PROMIENIE.maly,
        md: PROMIENIE.maly,
        lg: PROMIENIE.karta,
        card: PROMIENIE.karta,
        xl: PROMIENIE.duzy,
      },
      boxShadow: {
        xs: CIENIE.xs,
        sm: CIENIE.xs,
        DEFAULT: CIENIE.xs,
        pop: CIENIE.pop,
        md: CIENIE.pop,
        lg: CIENIE.pop,
        xl: CIENIE.pop,
      },
    },
  },
  plugins: [],
} satisfies Config;
