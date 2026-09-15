import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Strażnik notacji dziesiętnej.
 *
 * Po polsku separatorem dziesiętnym jest PRZECINEK. Aplikacja miała z tym rozjazd
 * w obrębie jednego ekranu: pozycja kosztorysu pokazywała „172,50 zł", a suma pod nią
 * „2021.50 zł"; kalkulator przyjmował „0,8", a wynik obok podawał „2.73 Ω". To liczby,
 * które elektryk przepisuje do oferty i do protokołu — kropka czyta się tam jak błąd.
 *
 * Jedno miejsce formatowania (`formatLiczba`) nie wystarczyło, bo nic nie pilnowało,
 * żeby go używać — stąd ten test. `toFixed` bez zamiany na przecinek jest błędem
 * wszędzie poza wypisanymi niżej wyjątkami, gdzie kropka jest WYMAGANA.
 */

/** Wyłączenie pojedynczej linii: ten znacznik w komentarzu nad nią, wraz z powodem. */
const ZNACZNIK_WYJATKU = "kropka-celowo";

/** Całe moduły, w których kropka obowiązuje wszędzie. */
const WYJATKI: Record<string, string> = {
  "lib/pdf/engine.ts": "składnia strumienia PDF — współrzędne i kolory muszą mieć kropkę, inaczej plik jest uszkodzony",
  "lib/panel/loads.ts": "klucz mapy, nigdy nie pokazywany użytkownikowi",
  "lib/pdf/costs.ts": "krok pośredni w `formatujKwote`, która sama dokłada przecinek",
};

function plikiZrodlowe(katalog: string): string[] {
  return fs.readdirSync(katalog, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(katalog, e.name);
    if (e.isDirectory()) return plikiZrodlowe(p);
    if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) return [];
    return [p];
  });
}

describe("notacja dziesiętna", () => {
  it("żadna liczba pokazywana użytkownikowi nie wychodzi z kropką", () => {
    const korzen = path.resolve(__dirname, "..");
    const winowajcy: string[] = [];

    for (const plik of plikiZrodlowe(korzen)) {
      const wzgledny = path.relative(korzen, plik).split(path.sep).join("/");
      if (WYJATKI[wzgledny]) continue;

      const tresc = fs.readFileSync(plik, "utf8").split(/\r?\n/);
      tresc.forEach((linia, i) => {
        if (!linia.includes("toFixed(")) return;
        // `.replace(".", ",")` tuż obok znaczy, że ktoś już o tym pomyślał.
        if (linia.includes("replace")) return;
        // Znacznik w komentarzu nad linią — razem z powodem, bo wyjątek bez
        // uzasadnienia zamienia ten test w formalność.
        const nadLinia = tresc.slice(Math.max(0, i - 4), i).join(" ");
        if (nadLinia.includes(ZNACZNIK_WYJATKU)) return;
        winowajcy.push(`${wzgledny}:${i + 1}`);
      });
    }

    expect(winowajcy).toEqual([]);
  });
});
