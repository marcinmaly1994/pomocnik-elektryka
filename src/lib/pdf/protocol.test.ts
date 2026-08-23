import { describe, it, expect, beforeAll } from "vitest";
import { buildProtocolPdf } from "./protocol";
import { stubPdfFontFetch } from "./testFontMock";
import type { DocumentHeader } from "@/types";
import type { ProtocolRow } from "@/lib/protocols";

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
    const rows: ProtocolRow[] = [{ obwod: "Obwód 1", u: 500, ln: 500, lpe: 400, npe: 300 }];
    const bytes = await buildProtocolPdf("izolacja", header, rows, 1.0);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("Dom jednorodzinny");
    expect(out).toContain("WYNIK POZYTYWNY");
  });

  it("negatywny wynik pomiaru trafia do treści PDF", async () => {
    const rows: ProtocolRow[] = [{ obwod: "Obwód 1", ln: 0.1, lpe: 0.1, npe: 0.1 }];
    const bytes = await buildProtocolPdf("izolacja", header, rows, 1.0);
    const out = bytesToAscii(bytes);
    expect(out).toContain("WYNIK NEGATYWNY");
  });

  it("brak wierszy -> brak kompletu danych", async () => {
    const bytes = await buildProtocolPdf("izolacja", header, [], 1.0);
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
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, [{ obwod: "Obwód 1", u: 500, ln: 500 }], 1.0));
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
