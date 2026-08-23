import { describe, it, expect, beforeAll } from "vitest";
import { buildDrawingPdf } from "./drawing";
import { stubPdfFontFetch } from "./testFontMock";
import type { PdfImage } from "./engine";
import type { DocumentHeader } from "@/types";

/**
 * Rysunek techniczny w PDF: kartka pozioma, rysunek jako raster, a wokół niego
 * wektorowa tabliczka rysunkowa i legenda.
 *
 * Legendy nie da się sprawdzić po samych pikselach — dlatego czyta się ją tutaj wprost
 * ze strumienia treści. Testy e2e sprawdzają, że strona się RYSUJE; ten sprawdza, co
 * na niej właściwie stoi.
 */

function bytesToAscii(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return out;
}

/** Odczytuje napisy razem z pozycją — do sprawdzania, gdzie legenda wylądowała. */
function napisy(out: string) {
  return [...out.matchAll(/BT \/(F\d) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(((?:\\.|[^)])*)\) Tj ET/g)].map((m) => ({
    size: Number(m[2]),
    x: Number(m[3]),
    y: Number(m[4]),
    t: m[5],
  }));
}

/** Prostokąty obrazów: `q w 0 0 h x y cm /ImN Do Q`. */
function obrazy(out: string) {
  return [...out.matchAll(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/Im(\d+) Do Q/g)].map((m) => ({
    w: Number(m[1]),
    h: Number(m[2]),
    x: Number(m[3]),
    y: Number(m[4]),
    im: Number(m[5]),
  }));
}

beforeAll(stubPdfFontFetch);

const header: DocumentHeader = {
  obiekt: "Dom jednorodzinny", adres: "ul. Testowa 1", zleceniodawca: "", wykonawca: "Elektryk",
  uprawnienia: "", przyrzad: "", nrFabryczny: "", swiadectwo: "", data: "2026-08-23",
  temperatura: "", wilgotnosc: "", uklad: "TN-S", drawingNo: "E-02", revision: "A",
};

/** Atrapa rastra — treść bajtów nie ma znaczenia dla układu strony. */
const obraz = (width: number, height: number): PdfImage => ({
  bytes: new Uint8Array([9, 9, 9]),
  width,
  height,
  filter: "FlateDecode",
});

const STRONA_W = 841.89;
const STRONA_H = 595.28;

describe("buildDrawingPdf", () => {
  it("składa kartkę POZIOMĄ — rysunki są szersze niż wyższe", async () => {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Schemat", header, rysunek: obraz(1600, 900) }));
    expect(out).toContain(`/MediaBox [0 0 ${STRONA_W.toFixed(2)} ${STRONA_H.toFixed(2)}]`);
  });

  it("wpisuje rysunek w pole Z ZACHOWANIEM PROPORCJI", async () => {
    // Rozciągnięcie do pełnego pola zniekształciłoby symbole, a na rzucie instalacji
    // proporcje niosą informację (odległości, strefy ochronne).
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1600, 900) }));
    const [rys] = obrazy(out);
    expect(rys).toBeDefined();
    expect(rys.w / rys.h).toBeCloseTo(1600 / 900, 2);
  });

  it("bardzo wysoki rysunek też się mieści — ogranicza go wysokość, nie szerokość", async () => {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(400, 2000) }));
    const [rys] = obrazy(out);
    expect(rys.w / rys.h).toBeCloseTo(400 / 2000, 2);
    expect(rys.y).toBeGreaterThanOrEqual(0);
    expect(rys.y + rys.h).toBeLessThanOrEqual(STRONA_H);
    expect(rys.x + rys.w).toBeLessThanOrEqual(STRONA_W);
  });

  it("bez legendy rysunek dostaje CAŁĄ szerokość kartki", async () => {
    const bez = obrazy(bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1000, 500) })));
    const z = obrazy(
      bytesToAscii(
        await buildDrawingPdf({
          tytul: "Rzut",
          header,
          rysunek: obraz(1000, 500),
          legenda: [{ symbol: obraz(40, 40), opis: "Gniazdo 230 V" }],
        })
      )
    );
    // Przy legendzie rysunek musi się zwęzić — inaczej wchodziłby pod nią.
    expect(z[0].w).toBeLessThan(bez[0].w);
  });

  describe("legenda", () => {
    const legenda = [
      { symbol: obraz(40, 40), opis: "Gniazdo 230 V" },
      { symbol: obraz(40, 40), opis: "Łącznik świecznikowy — 2× klawisze" },
    ];

    it("ma nagłówek i opisy symboli", async () => {
      const out = bytesToAscii(
        await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1000, 600), legenda })
      );
      const t = napisy(out).map((n) => n.t);
      expect(t).toContain("LEGENDA");
      expect(t).toContain("Gniazdo 230 V");
    });

    it("NIE podaje liczby sztuk", async () => {
      // Legenda ma objaśniać, co dany znak oznacza. Zestawienie ilościowe to inny
      // dokument (kosztorys), a liczba wydrukowana obok symbolu starzeje się przy
      // każdej zmianie projektu i bywa po prostu nieprawdziwa.
      const out = bytesToAscii(
        await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1000, 600), legenda })
      );
      const naglowek = napisy(out).find((n) => n.t === "LEGENDA")!;
      const wLegendzie = napisy(out).filter((n) => n.x >= naglowek.x && n.y < naglowek.y);
      expect(wLegendzie.length).toBeGreaterThan(0);
      for (const n of wLegendzie) expect(n.t).not.toMatch(/^\d+\s*[x×]$/i);
    });

    it("stoi po PRAWEJ stronie kartki, obok rysunku", async () => {
      const out = bytesToAscii(
        await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1000, 600), legenda })
      );
      const naglowek = napisy(out).find((n) => n.t === "LEGENDA")!;
      const rys = obrazy(out).find((o) => o.im === 1)!;
      expect(naglowek.x).toBeGreaterThan(STRONA_W / 2);
      // Rysunek kończy się, zanim zacznie się legenda — nie zachodzą na siebie.
      expect(rys.x + rys.w).toBeLessThanOrEqual(naglowek.x);
    });

    it("każdy wpis dostaje SWÓJ symbol jako osobny obraz", async () => {
      const out = bytesToAscii(
        await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1000, 600), legenda })
      );
      // 1 rysunek + 2 symbole; symbole są kwadratowe i wyraźnie mniejsze od rysunku.
      const wszystkie = obrazy(out);
      expect(wszystkie).toHaveLength(3);
      const symbole = wszystkie.filter((o) => o.im !== 1);
      expect(symbole).toHaveLength(2);
      for (const s of symbole) expect(s.w).toBeCloseTo(s.h, 5);
    });

    it("długi opis łamie się na dwie linie zamiast wyjeżdżać poza ramkę", async () => {
      const out = bytesToAscii(
        await buildDrawingPdf({
          tytul: "Rzut",
          header,
          rysunek: obraz(1000, 600),
          legenda: [{ symbol: obraz(40, 40), opis: "Oprawa oświetleniowa sufitowa w pomieszczeniu technicznym" }],
        })
      );
      const naglowek = napisy(out).find((n) => n.t === "LEGENDA")!;
      const opisy = napisy(out).filter((n) => n.x > naglowek.x && n.y < naglowek.y);
      expect(opisy.length).toBeGreaterThanOrEqual(2);
      for (const o of opisy) expect(o.x).toBeLessThan(STRONA_W);
    });
  });
});

/**
 * Tabliczka rysunkowa. Testowana tu, bo rysunek jest jedynym dokumentem, w którym
 * widać ją w całości — ale wada dotyczyła WSZYSTKICH PDF-ów, także protokołów.
 *
 * Trzecia kolumna upychała cztery napisy w wysokości przewidzianej na trzy: etykieta
 * „DATA" lądowała 2 pt pod dziewięciopunktowym numerem rysunku i obie linie zlewały
 * się w jedną plamę. Test mierzy odstępy pionowe w obrębie kolumny, bo tylko one
 * odróżniają czytelną metrykę od nieczytelnej.
 */
describe("tabliczka rysunkowa", () => {
  async function metryka() {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut - Parter", header, rysunek: obraz(1000, 600) }));
    return napisy(out).filter((n) => n.y < 100);
  }

  it("zawiera komplet rubryk", async () => {
    const t = (await metryka()).map((n) => n.t);
    for (const rubryka of ["OBIEKT", "RYSUNEK / DOKUMENT", "NR RYS.", "REW.", "DATA"]) {
      expect(t).toContain(rubryka);
    }
    expect(t).toContain("E-02");
    expect(t).toContain("2026-08-23");
  });

  it("napisy w jednej kolumnie nie nachodzą na siebie", async () => {
    const m = await metryka();
    // Grupujemy po X (ta sama rubryka = ta sama krawędź lewa) i sprawdzamy, czy
    // kolejne linie bazowe dzieli co najmniej wysokość większego z dwóch napisów.
    const kolumny = new Map<number, typeof m>();
    for (const n of m) {
      const klucz = Math.round(n.x);
      kolumny.set(klucz, [...(kolumny.get(klucz) ?? []), n]);
    }
    for (const [x, napisyKolumny] of kolumny) {
      const posortowane = [...napisyKolumny].sort((a, b) => b.y - a.y);
      for (let i = 0; i < posortowane.length - 1; i++) {
        const gorny = posortowane[i];
        const dolny = posortowane[i + 1];
        const odstep = gorny.y - dolny.y;
        expect(odstep, `x=${x}: „${gorny.t}" i „${dolny.t}" stoją ${odstep} pt od siebie`).toBeGreaterThanOrEqual(
          Math.max(gorny.size, dolny.size)
        );
      }
    }
  });

  it("rysunek nie wchodzi na tabliczkę", async () => {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1000, 600) }));
    const [rys] = obrazy(out);
    const gornaKrawedzTabliczki = 36 - 6 + 48; // margines - odsadzka + wysokość paska
    expect(rys.y).toBeGreaterThanOrEqual(gornaKrawedzTabliczki);
  });
});
