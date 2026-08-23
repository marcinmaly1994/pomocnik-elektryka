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
          legenda: [{ symbol: obraz(40, 40), opis: "Gniazdo 230 V", ile: 3 }],
        })
      )
    );
    // Przy legendzie rysunek musi się zwęzić — inaczej wchodziłby pod nią.
    expect(z[0].w).toBeLessThan(bez[0].w);
  });

  describe("legenda", () => {
    const legenda = [
      { symbol: obraz(40, 40), opis: "Gniazdo 230 V", ile: 3 },
      { symbol: obraz(40, 40), opis: "Łącznik świecznikowy — 2× klawisze", ile: 2 },
    ];

    it("ma nagłówek, opisy i liczbę sztuk", async () => {
      const out = bytesToAscii(
        await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1000, 600), legenda })
      );
      const t = napisy(out).map((n) => n.t);
      expect(t).toContain("LEGENDA");
      expect(t).toContain("Gniazdo 230 V");
      // Liczba sztuk — przy odbiorze sprawdza się, czy policzone zgadza się z zamontowanym.
      expect(t.some((s) => /^3\s*x$/i.test(s))).toBe(true);
      expect(t.some((s) => /^2\s*x$/i.test(s))).toBe(true);
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
