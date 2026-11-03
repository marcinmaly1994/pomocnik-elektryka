import { describe, it, expect, beforeAll } from "vitest";
import { buildDrawingPdf, hexNaRgb } from "./drawing";
import { pdfEscape } from "./engine";
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
    const bez = obrazy(bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1000, 500) })))[0];
    expect(bez.x).toBeCloseTo(36, 0);
    expect(bez.x + bez.w).toBeCloseTo(STRONA_W - 36, 0);
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

    it("nie zachodzi na rysunek — lezy obok niego albo pod nim", async () => {
      const out = bytesToAscii(
        await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1000, 600), legenda })
      );
      const naglowek = napisy(out).find((n) => n.t === "LEGENDA")!;
      const rys = obrazy(out).find((o) => o.im === 1)!;
      const obok = rys.x + rys.w <= naglowek.x + 0.5;
      const podSpodem = naglowek.y < rys.y;
      expect(obok || podSpodem).toBe(true);
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

  /**
   * Nazwa projektu w tabliczce jest podpisem DOKUMENTU — ucięta („Dom jednorodzinny
   * przykładowy,..") mówi mniej, niż powinna, a na każdym rysunku w poziomie stała
   * szerokość rubryki obcinała ją przy 28 znakach, choć trzecia kolumna miała 450 pt
   * prawie pustego miejsca.
   */
  it("pełna nazwa obiektu mieści się w tabliczce na kartce POZIOMEJ", async () => {
    const nazwa = "Dom jednorodzinny przykładowy, 136 m²";
    const out = bytesToAscii(
      await buildDrawingPdf({ tytul: "Rzut - Parter", header: { ...header, obiekt: nazwa }, rysunek: obraz(1000, 600) })
    );
    const wartosc = napisy(out).find((n) => n.t === pdfEscape(nazwa));
    expect(wartosc, "nazwa obiektu przycięta wielokropkiem").toBeDefined();
    // Na poziomej kartce rubryka jest dość szeroka, więc nazwa idzie pełną czcionką 9 pt.
    expect(wartosc!.size).toBe(9);
  });

  it("rysunek nie wchodzi na tabliczkę", async () => {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(1000, 600) }));
    const [rys] = obrazy(out);
    const gornaKrawedzTabliczki = 36 - 6 + 48; // margines - odsadzka + wysokość paska
    expect(rys.y).toBeGreaterThanOrEqual(gornaKrawedzTabliczki);
  });
});

/**
 * Wyrównanie legendy do rysunku.
 *
 * Rysunek jest w pionie WYŚRODKOWANY w swoim polu, więc legenda przypięta do górnej
 * krawędzi pola zaczynała się wyżej niż on i kartka wyglądała na niepoprawnie złożoną.
 * Zgłoszone przez użytkownika: „obniż legendę, aby była na równo z planem".
 */
/**
 * Gdzie ląduje legenda i ile zostaje dla rysunku.
 *
 * Kolumna po prawej zabierała rysunkowi 188 z 770 punktów szerokosci ZAWSZE — takze
 * wtedy, gdy legenda miala cztery pozycje i siegala jednej trzeciej wysokosci kartki,
 * a pod nia zostawal pusty prostokat przez cala jej wysokosc. Legenda idzie teraz tam,
 * gdzie kosztuje rysunek NAJMNIEJ, a o wyborze decyduje porownanie skali, nie regula
 * „jesli szeroki, to pod spodem".
 */
describe("legenda względem rysunku", () => {
  const poz = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ symbol: obraz(40, 40), opis: `Symbol ${i + 1}` }));

  /** Pasek naglowka legendy to prostokat o szarosci 0.88 — po nim poznajemy jej miejsce. */
  async function uklad(rysW: number, rysH: number, ile: number) {
    const out = bytesToAscii(
      await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(rysW, rysH), legenda: poz(ile) })
    );
    const rys = obrazy(out).find((o) => o.im === 1)!;
    const pasek = [...out.matchAll(/0\.88 g ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re f/g)]
      .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }))
      .find((r) => r.w >= 176 && r.h < 30)!;
    return { rys, pasek };
  }

  it("przy SZEROKIM rysunku legenda idzie pod niego, a rysunek dostaje cala szerokosc", async () => {
    const { rys, pasek } = await uklad(2400, 500, 4);
    // Rysunek siega obu marginesow kartki — kolumna nie zabiera mu juz szerokosci.
    expect(rys.x).toBeCloseTo(36, 0);
    expect(rys.x + rys.w).toBeCloseTo(STRONA_W - 36, 0);
    // Legenda lezy PONIZEJ rysunku, nie obok.
    expect(pasek.y).toBeLessThan(rys.y);
  });

  it("przy WYSOKIM rysunku legenda zostaje w kolumnie po prawej", async () => {
    const { rys, pasek } = await uklad(400, 1000, 3);
    expect(pasek.x).toBeGreaterThan(STRONA_W / 2);
    // Rysunek konczy sie, zanim zacznie sie legenda — nie zachodza na siebie.
    expect(rys.x + rys.w).toBeLessThanOrEqual(pasek.x + 0.5);
  });

  /** Sedno poprawki: legenda nie moze pomniejszac rysunku bardziej, niz to konieczne. */
  it("legenda nigdy nie zmniejsza rysunku bardziej niz musi", async () => {
    const bez = obrazy(bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(2400, 500) })))[0];
    const { rys } = await uklad(2400, 500, 4);
    // Przy szerokim rysunku dolozenie legendy NIE zwęża go wcale — pasek zabiera
    // wysokosc, ktorej i tak nie wykorzystywal.
    expect(rys.w).toBeCloseTo(bez.w, 0);
  });

  it("w kolumnie gora legendy rowna sie gorze rysunku", async () => {
    const { rys, pasek } = await uklad(400, 1000, 3);
    expect(pasek.y + pasek.h).toBeCloseTo(rys.y + rys.h, 1);
  });

  it("dluga legenda nie schodzi pod pole rysunku — nie wchodzi na tabliczke", async () => {
    const { pasek } = await uklad(400, 1000, 12);
    const dolPola = 36 + 48 + 8; // margines + tabliczka
    const dolLegendy = pasek.y + pasek.h - (20 + 12 * 26);
    expect(dolLegendy).toBeGreaterThanOrEqual(dolPola - 0.5);
  });
});

/**
 * Legenda razem z kluczem tras: gdzie stoją i ile zostaje rysunkowi.
 *
 * Klucz tras wymuszał pasek pod rysunkiem bez porównania. Przy rzucie domu z legendą
 * o 23 pozycjach pasek zjadał 332 z 461 pt wysokości pola: rysunek dostawał 117 pt,
 * czyli około 4,4 cm szerokości na kartce A4 — na głównym dokumencie aplikacji.
 */
describe("legenda i klucz tras razem", () => {
  const poz = (n: number) => Array.from({ length: n }, (_, i) => ({ symbol: obraz(40, 40), opis: `Symbol ${i + 1}` }));
  const klucz = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ opis: `Oznaczenie ${i + 1}`, rgb: [0.35, 0.35, 0.35] as [number, number, number], grubosc: 1 }));

  const STRONA_H = 595.28;
  const DOL_POLA = 36 + 48 + 8; // margines + tabliczka
  const GORA_POLA = STRONA_H - 36;

  type Prost = { x: number; y: number; w: number; h: number };
  const nachodza = (a: Prost, b: Prost) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

  async function ulozenie(rysW: number, rysH: number, legenda: number, kluczTras: number) {
    const out = bytesToAscii(
      await buildDrawingPdf({
        tytul: "Rzut",
        header,
        rysunek: obraz(rysW, rysH),
        legenda: legenda ? poz(legenda) : undefined,
        kluczTras: kluczTras ? klucz(kluczTras) : undefined,
      })
    );
    const rys = obrazy(out).find((o) => o.im === 1)!;
    // Tło legendy i klucza to prostokąty o szarości 0.985; tło tabliczki leży niżej niż pole.
    const bloki: Prost[] = [...out.matchAll(/0\.985 g ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re f/g)]
      .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }))
      .filter((r) => r.y >= DOL_POLA - 0.5);
    return { rys: { x: rys.x, y: rys.y, w: rys.w, h: rys.h }, bloki };
  }

  it("rzut domu (23 pozycje legendy i klucz) dostaje więcej niż jedną czwartą kartki", async () => {
    const { rys } = await ulozenie(1300, 1000, 23, 4);
    // Poprzedni układ: rysunek 152 pt szerokości. Kolumna po prawej daje ponad 400.
    expect(rys.w).toBeGreaterThan(380);
  });

  it("legenda i klucz stoją razem w kolumnie, a nie w pasku, który zjadałby wysokość", async () => {
    const { rys, bloki } = await ulozenie(1300, 1000, 23, 4);
    expect(bloki).toHaveLength(2);
    for (const b of bloki) expect(b.x).toBeGreaterThanOrEqual(rys.x + rys.w - 0.5);
  });

  /**
   * Własność, nie przykład: przy KAŻDEJ kombinacji rozmiaru legendy, klucza i proporcji
   * rysunku nic na nic nie nachodzi i wszystko mieści się w polu nad tabliczką.
   */
  it("bloki nie nachodzą na rysunek ani na siebie i mieszczą się w polu — przy wielu kombinacjach", async () => {
    for (const [rysW, rysH] of [[2400, 500], [1300, 1000], [1000, 1000], [400, 1000]]) {
      for (const legenda of [0, 1, 3, 12, 23, 30]) {
        for (const kluczTras of [0, 2, 4]) {
          const { rys, bloki } = await ulozenie(rysW, rysH, legenda, kluczTras);
          const opis = `rysunek ${rysW}x${rysH}, legenda ${legenda}, klucz ${kluczTras}`;
          expect(bloki, opis).toHaveLength((legenda ? 1 : 0) + (kluczTras ? 1 : 0));
          for (const b of bloki) {
            expect(nachodza(b, rys), `${opis}: blok na rysunku`).toBe(false);
            expect(b.y, `${opis}: blok pod polem`).toBeGreaterThanOrEqual(DOL_POLA - 0.5);
            expect(b.y + b.h, `${opis}: blok nad polem`).toBeLessThanOrEqual(GORA_POLA + 0.5);
            expect(b.x, `${opis}: blok za lewym marginesem`).toBeGreaterThanOrEqual(36 - 0.5);
            expect(b.x + b.w, `${opis}: blok za prawym marginesem`).toBeLessThanOrEqual(STRONA_W - 36 + 0.5);
          }
          if (bloki.length === 2) expect(nachodza(bloki[0], bloki[1]), `${opis}: legenda na kluczu`).toBe(false);
        }
      }
    }
    // 72 kombinacje, każda to osobny PDF z osadzoną czcionką — domyślne 5 s nie wystarcza.
  }, 60_000);
});

/**
 * Klucz oznaczeń i spis obwodów.
 *
 * Legenda objasnia symbole, ale nie trasy — a te niosa trzy rozroznienia naraz:
 * grubosc (zasilanie czy sterowanie), kreske (trasa policzona czy szacunek) i kolor
 * (ktory obwod). Bez klucza arkusz wyslany komus innemu jest nieczytelny: kolory widac,
 * ale nie wiadomo, co znacza.
 */
describe("klucz oznaczen tras", () => {
  const klucz = [
    { opis: "Zasilanie obwodu", rgb: [0.35, 0.35, 0.35] as [number, number, number], grubosc: 1.5 },
    { opis: "Sterowanie", rgb: [0.35, 0.35, 0.35] as [number, number, number], grubosc: 1, kreska: [1, 3] },
  ];

  it("ma naglowek i opisy probek", async () => {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(2400, 500), kluczTras: klucz }));
    const t = napisy(out).map((n) => n.t);
    expect(t).toContain("OZNACZENIA TRAS");
    expect(t).toContain("Zasilanie obwodu");
  });

  /** Kreska w probce to nie ozdoba — po niej czytelnik poznaje trase szacowana. */
  it("probka kreskowana wychodzi ze wzorem kreski, ciagla bez niego", async () => {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(2400, 500), kluczTras: klucz }));
    expect(out).toMatch(/\[1 3\] 0 d/);
  });

  it("bez klucza nic sie nie rysuje", async () => {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(2400, 500) }));
    expect(napisy(out).map((n) => n.t)).not.toContain("OZNACZENIA TRAS");
  });
});

describe("spis obwodow", () => {
  const obwody = [
    { kolor: [0.12, 0.44, 0.7] as [number, number, number], nazwa: "Obwód gniazd ogólnych 1", kabel: "YDYp 3x2,5 mm²", zabezpieczenie: "B16" },
    { kolor: [0.82, 0.41, 0.12] as [number, number, number], nazwa: "Obwód oświetlenia 1", kabel: "YDYp 3x1,5 mm²", zabezpieczenie: "B10" },
  ];

  it("podaje nazwe, przewod i zabezpieczenie kazdego obwodu", async () => {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(2400, 500), obwody }));
    const t = napisy(out).map((n) => n.t);
    // Polskie znaki siedza w strumieniu w kodowaniu podzbioru fontu, wiec porownujemy
    // po fragmentach ASCII — tresc i tak jest tu jednoznaczna.
    expect(t.some((x) => x.startsWith("SPIS OBWOD"))).toBe(true);
    expect(t.some((x) => x.startsWith("Obw"))).toBe(true);
    expect(t).toContain("B16");
  });

  /** Probka barwy to JEDYNE, co laczy wiersz spisu z linia na rzucie. */
  it("kazdy wiersz ma probke w kolorze swojej trasy", async () => {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(2400, 500), obwody }));
    expect(out).toContain("0.120 0.440 0.700 RG");
    expect(out).toContain("0.820 0.410 0.120 RG");
  });

  it("bez obwodow strona spisu w ogole nie powstaje", async () => {
    const out = bytesToAscii(await buildDrawingPdf({ tytul: "Rzut", header, rysunek: obraz(2400, 500) }));
    expect(napisy(out).map((n) => n.t).some((x) => x.startsWith("SPIS OBWOD"))).toBe(false);
  });
});

describe("hexNaRgb", () => {
  it("zamienia kolor obwodu na trojke, ktora rozumie PDF", () => {
    expect(hexNaRgb("#1F6FB2")).toEqual([0x1f / 255, 0x6f / 255, 0xb2 / 255]);
  });

  /** Kolor spoza formatu ma dac czern, a nie NaN — NaN rozlalby sie na caly plik. */
  it("smiec na wejsciu daje czern, nie NaN", () => {
    for (const zly of ["", "czerwony", "#12", "#gggggg"]) {
      expect(hexNaRgb(zly)).toEqual([0, 0, 0]);
    }
  });
});
