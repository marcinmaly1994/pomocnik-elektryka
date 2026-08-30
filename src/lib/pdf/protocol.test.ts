import { describe, it, expect, beforeAll } from "vitest";
import { buildProtocolPdf } from "./protocol";
import { pdfTextWidth } from "./engine";
import { stubPdfFontFetch } from "./testFontMock";
import type { DocumentHeader } from "@/types";
import { PROTOCOL_DEFS, type ProtocolRow } from "@/lib/protocols";

function bytesToAscii(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // osadzony font w bajtach jest za duży na jedno wywołanie fromCharCode(...bytes)
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return out;
}

beforeAll(stubPdfFontFetch);

const header: DocumentHeader = {
  obiekt: "Dom jednorodzinny", adres: "ul. Testowa 1", zleceniodawca: "Jan Kowalski",
  wykonawca: "Elektryk Sp. z o.o.", uprawnienia: "SEP E/D 1234", przyrzad: "Sonel MPI-540",
  nrFabryczny: "SN12345", swiadectwo: "2026-01-01", data: "2026-08-18",
  temperatura: "20", wilgotnosc: "55", uklad: "TN-S", drawingNo: "E-01", revision: "A",
};

describe("buildProtocolPdf — protokół tabelaryczny (izolacja)", () => {
  it("produkuje poprawny PDF z danymi ogólnymi i wynikiem", async () => {
    const rows: ProtocolRow[] = [{ obwod: "Obwód 1", l1n: 500, l1pe: 400, npe: 300 }];
    const bytes = await buildProtocolPdf("izolacja", header, rows, 500);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("Dom jednorodzinny");
    expect(out).toContain("WYNIK POZYTYWNY");
  });

  it("negatywny wynik pomiaru trafia do treści PDF", async () => {
    const rows: ProtocolRow[] = [{ obwod: "Obwód 1", l1n: 0.1, l1pe: 0.1, npe: 0.1 }];
    const bytes = await buildProtocolPdf("izolacja", header, rows, 500);
    const out = bytesToAscii(bytes);
    expect(out).toContain("WYNIK NEGATYWNY");
  });

  it("brak wierszy -> brak kompletu danych", async () => {
    const bytes = await buildProtocolPdf("izolacja", header, [], 500);
    const out = bytesToAscii(bytes);
    expect(out).toContain("BRAK KOMPLETU DANYCH");
  });
});

describe("buildProtocolPdf — protokół checklistowy (oględziny)", () => {
  it("zawiera pozycje listy kontrolnej i tytuł", async () => {
    const rows: ProtocolRow[] = [{ text: "Zgodność wykonania instalacji z dokumentacją projektową", status: "tak" }];
    const bytes = await buildProtocolPdf("ogledziny", header, rows, 0);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("zgodne");
  });
});

describe("buildProtocolPdf — dopisek Uwagi", () => {
  it("długie uwagi są zawijane bez wyjątków", async () => {
    const longNote = "To jest bardzo długa uwaga testowa ".repeat(10);
    const bytes = await buildProtocolPdf("uziemienie", { ...header, uwagi: longNote }, [{ miejsce: "Uziom główny", r: 5 }], 30);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("Uwagi:");
  });
});

/**
 * Układ nagłówka — pilnowany liczbowo, bo obie usterki, które tu wystąpiły, były
 * NIEWIDOCZNE dla testów sprawdzających samą obecność tekstu w pliku: napisy były
 * w PDF-ie, tylko leżały jeden na drugim i pod szarym tłem. Zgłosił to dopiero
 * użytkownik („brakuje nagłówków, na górze jest jakiś szary prostokąt").
 *
 * Strumień treści nie jest kompresowany, więc operatory czyta się wprost:
 *   tekst  ->  `<szarość> g BT /F<n> <rozmiar> Tf <x> <y> Td (...) Tj ET`
 *   tło    ->  `<szarość> g <x> <y> <szer> <wys> re f`
 * `re` liczy od LEWEGO DOLNEGO rogu i rośnie w GÓRĘ — na tym poległa pierwsza wersja.
 */
describe("buildProtocolPdf — układ nagłówka", () => {
  const WYS_STRONY = 842; // A4 w punktach

  async function nagl() {
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, [{ obwod: "Obwód 1", l1n: 500 }], 500));
    const tytul = out.match(/\/F2 13 Tf [\d.]+ ([\d.]+) Td/);
    const norma = out.match(/0\.35 g BT \/F1 8\.5 Tf [\d.]+ ([\d.]+) Td/);
    const tlo = out.match(/0\.965 g [\d.]+ ([\d.]+) [\d.]+ ([\d.]+) re f/);
    expect(tytul, "brak tytułu 13 pt").not.toBeNull();
    expect(norma, "brak wiersza z normą").not.toBeNull();
    expect(tlo, "brak szarego tła danych ogólnych").not.toBeNull();
    return {
      tytulY: Number(tytul![1]),
      normaY: Number(norma![1]),
      tloDol: Number(tlo![1]),
      tloGora: Number(tlo![1]) + Number(tlo![2]),
    };
  }

  it("tytuł i wiersz z normą nie nachodzą na siebie", async () => {
    const { tytulY, normaY } = await nagl();
    // Tytuł ma 13 pt, więc jego linia potrzebuje co najmniej tyle odstępu.
    expect(tytulY - normaY).toBeGreaterThanOrEqual(13);
  });

  it("szare tło danych ogólnych leży POD nagłówkiem i mieści się na stronie", async () => {
    const { normaY, tloDol, tloGora } = await nagl();
    expect(tloGora).toBeLessThan(normaY); // nie przykrywa tytułu ani normy
    expect(tloGora).toBeLessThan(WYS_STRONY); // nie wychodzi poza krawędź kartki
    expect(tloDol).toBeGreaterThan(0);
  });
});

/**
 * Wyrównanie kolumn tabeli wyników.
 *
 * Zgłoszenie: „dane z protokołów nie są bezpośrednio pod nagłówkami". Pozycje x były
 * przy tym arytmetycznie ZGODNE — wszystko stało przy lewej krawędzi kolumny, więc
 * krótkie „500" siedziało pod lewym skrajem szerokiego „U pom. [V]" i oko wiązało
 * wartość z sąsiednią kolumną. Test mierzy więc ŚRODKI, a nie początki napisów:
 * to one decydują, czy tabela czyta się kolumnami.
 */
describe("buildProtocolPdf — wyrównanie kolumn", () => {
  /** Wszystkie napisy ze strumienia treści wraz z pozycją i krojem. */
  function napisy(out: string) {
    // `(?:\\.|[^)])` — nie tylko "." (kropka), ale KAŻDY znak poprzedzony
    // backslashem (w tym escapowany nawias „\)"), inaczej etykiety z nawiasami
    // w tekście (np. „Typ przewodu (kabla)...") urywały dopasowanie regexu na
    // pierwszym escapowanym „\)", mimo że w samym PDF-ie tekst jest poprawny.
    return [...out.matchAll(/BT \/(F\d) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(((?:\\.|[^)])*)\) Tj ET/g)].map((m) => ({
      bold: m[1] === "F2",
      size: Number(m[2]),
      x: Number(m[3]),
      y: Number(m[4]),
      t: m[5],
    }));
  }

  it("wartości liczbowe stoją w tej samej osi co ich nagłówki", async () => {
    const rows: ProtocolRow[] = [{ typ: "YDYp 3x2,5", obwod: "Obwód 1", l1l2: 250 }];
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, rows, 500));
    const w = napisy(out);

    const yNag = w.find((n) => n.t === "Ocena")!.y;
    const naglowki = w.filter((n) => Math.abs(n.y - yNag) < 0.5).sort((a, b) => a.x - b.x);
    const yDane = Math.max(...w.filter((n) => n.y < yNag - 5).map((n) => n.y));
    const dane = w.filter((n) => Math.abs(n.y - yDane) < 0.5).sort((a, b) => a.x - b.x);
    // Lp. + typ + obwód + 10 par + R wymagana + Ocena
    const oczekiwana = PROTOCOL_DEFS.izolacja.columns!.length + 2;
    expect(naglowki).toHaveLength(oczekiwana);
    expect(dane).toHaveLength(oczekiwana);

    // Środek napisu = początek + połowa jego szerokości.
    const srodek = (n: { x: number; t: string; size: number; bold: boolean }) =>
      n.x + pdfTextWidth(n.t.replace(/\\\d{3}/g, "X"), n.size, n.bold) / 2;

    // Kolumny liczbowe/wyśrodkowane (Lp., pary, R wymagana, Ocena) — nagłówek i
    // wartość muszą mieć wspólną oś. Kolumny 1-2 (typ, obwód) są tekstowe, więc
    // pomijamy je tutaj. 1,5 pt zapasu na przybliżenie tablic metryk.
    for (let i = 0; i < oczekiwana; i++) {
      if (i === 1 || i === 2) continue;
      expect(Math.abs(srodek(naglowki[i]) - srodek(dane[i]))).toBeLessThan(1.5);
    }

    // Kolumny opisowe (typ, obwód) zostają przy LEWEJ — mają zaczynać się w tym
    // samym miejscu w każdym wierszu, więc tu zgadzać ma się początek, nie środek.
    expect(dane[1].x).toBe(naglowki[1].x);
    expect(dane[2].x).toBe(naglowki[2].x);
  });

  it("nagłówki sąsiednich kolumn nie zachodzą na siebie", async () => {
    const rows: ProtocolRow[] = [{ typ: "YDYp 3x2,5", obwod: "Obwód 1", l1l2: 250 }];
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, rows, 500));
    const w = napisy(out);
    const yNag = w.find((n) => n.t === "Ocena")!.y;
    const naglowki = w.filter((n) => Math.abs(n.y - yNag) < 0.5).sort((a, b) => a.x - b.x);

    // „R min [MOhm]" stykało się z „Ocena", bo Ω szło jako trzyznakowe „Ohm".
    for (let i = 0; i < naglowki.length - 1; i++) {
      const koniec = naglowki[i].x + pdfTextWidth(naglowki[i].t.replace(/\\\d{3}/g, "X"), naglowki[i].size, naglowki[i].bold);
      expect(koniec).toBeLessThan(naglowki[i + 1].x);
    }
  });

  it("Ω i ° idą jako własne glify, a nie jako „Ohm” i „st.”", async () => {
    const rows: ProtocolRow[] = [{ typ: "YDYp 3x2,5", obwod: "Obwód 1", l1l2: 250 }];
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, rows, 500));
    // 146 ósemkowo = \222 (Ω), 147 = \223 (°). Jednostka [MΩ] jest teraz jedna dla
    // całej tabeli (w tekście wstępu), nie powtórzona w każdej kolumnie pary.
    expect(out).toContain("[M\\222]");
    expect(out).toContain("Temperatura [\\223C]");
    expect(out).not.toContain("MOhm");
    expect(out).not.toContain("st.C");
  });
});
